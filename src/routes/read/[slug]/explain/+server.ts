import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { json } from '@sveltejs/kit'
import { env } from '$env/dynamic/private'
import type { RequestHandler } from './$types'
import type { Article } from '$lib/article'
import type { ExplainAnswer, ExplainError } from '$lib/explain'
import { EXPLAIN_COOKIE, EXPLAIN_WINDOW_MS } from '$lib/explain'
import type { PromptContext } from '$lib/explain-server'
import {
	cookieDecision,
	etymologyFromPage,
	NO_DATA,
	parseModelAnswer,
	promptContext,
	promptHash,
	promptValues,
	renderPrompt,
	unknownPlaceholders
} from '$lib/explain-server'

// Same server-side glob as the reader's load: the article JSON never reaches
// the browser.
const articles = import.meta.glob<{ default: Article }>('$lib/content/*.json')

const DEFAULT_PROMPT_PATH = 'prompts/word.md'
const DEFAULT_CACHE_DIR = '.cache/explanations'
const DEFAULT_TIMEOUT_MS = 20_000
const DEFAULT_MAX_TOKENS = 400
const DEFAULT_TEMPERATURE = 0.3
const DEFAULT_WIKTIONARY_URL = 'https://ru.wiktionary.org/w/api.php'
const DEFAULT_WIKTIONARY_TIMEOUT_MS = 4_000
const DEFAULT_USER_AGENT = 'ru-reader/0.1 (personal reading tool)'

const UPSTREAM_MESSAGE = 'Сервис объяснений ответил ошибкой (502)'
const TIMEOUT_MESSAGE = 'Сервис не ответил вовремя'

type Config = {
	baseUrl: string
	apiKey: string
	model: string
	promptPath: string
	timeoutMs: number
	maxTokens: number
	temperature: number
	cacheDir: string
	wiktionaryUrl: string
	wiktionaryTimeoutMs: number
	userAgent: string
}

type CacheRecord = {
	promptHash: string
	createdAt: string
	slug: string
	paragraph: number
	ruSentence: string
	word: string
	lemma: string
	model: string
	etymologySource: 'wiktionary' | 'model'
	answer: { meaning: string; etymology: string | null; example: string | null }
	raw: string
}

class ExplainHttpError extends Error {
	constructor(
		readonly status: number,
		readonly body: ExplainError
	) {
		super(body.error)
	}
}

/** Identical requests that arrive while one is running share its promise (§6). */
const inFlight = new Map<string, Promise<CacheRecord>>()

export const POST: RequestHandler = async ({ request, params, cookies, url }) => {
	const started = Date.now()
	const slug = params.slug
	let paragraph = -1
	let lemma = '-'
	let cached = false

	const log = (status: number) => {
		const elapsedMs = Date.now() - started
		console.log(
			`explain slug=${slug} paragraph=${paragraph} lemma=${lemma} cached=${cached} status=${status} elapsedMs=${elapsedMs}`
		)
		return elapsedMs
	}

	const fail = (status: number, error: ExplainError, headers: Record<string, string> = {}) => {
		log(status)
		return json(error, { status, headers })
	}

	let body: unknown
	try {
		body = await request.json()
	} catch {
		return fail(400, { error: 'bad-request', message: 'Неверный запрос' })
	}

	const input = (body ?? {}) as Record<string, unknown>
	if (!Number.isInteger(input.paragraph) || !Number.isInteger(input.tokenIndex)) {
		return fail(400, { error: 'bad-request', message: 'Неверный запрос' })
	}
	paragraph = input.paragraph as number
	const tokenIndex = input.tokenIndex as number

	const entry = Object.entries(articles).find(([path]) => path.endsWith(`/${slug}.json`))
	if (!entry) {
		return fail(404, { error: 'not-found', message: `Статья «${slug}» не найдена` })
	}
	const article = (await entry[1]()).default

	const derived = promptContext(article, paragraph, tokenIndex)
	if (!derived.ok) {
		const message =
			derived.reason === 'paragraph'
				? 'Такого абзаца нет в статье'
				: derived.reason === 'token'
					? 'Такого слова нет в абзаце'
					: 'Не удалось определить предложение'
		return fail(400, { error: 'bad-request', message })
	}
	const context = derived.context
	lemma = context.lemma

	const config = readConfig()
	if (!config.baseUrl || !config.apiKey || !config.model) {
		const missing: string[] = []
		if (!config.baseUrl) missing.push('EXPLAIN_BASE_URL')
		if (!config.apiKey) missing.push('EXPLAIN_API_KEY')
		if (!config.model) missing.push('EXPLAIN_MODEL')
		return fail(503, {
			error: 'not-configured',
			message: `Объяснения не настроены: нет ${missing.join(', ')}`
		})
	}

	let template: string
	try {
		template = await readFile(resolve(config.promptPath), 'utf8')
	} catch {
		return fail(503, {
			error: 'prompt-invalid',
			message: `Промпт не найден: ${config.promptPath}`
		})
	}
	if (template.trim() === '') {
		return fail(503, {
			error: 'prompt-invalid',
			message: `Промпт пуст: ${config.promptPath}`
		})
	}
	const unknown = unknownPlaceholders(template)
	if (unknown.length > 0) {
		return fail(503, {
			error: 'prompt-invalid',
			message: `Неизвестные подстановки: ${unknown.map((name) => `{{${name}}}`).join(', ')}`
		})
	}

	// The fetched text is part of the rendered prompt, so it is fetched before
	// the cache is consulted (§6). It never fails the request.
	const etymology = await lookupEtymology(config, context.lemma)
	const etymologySource: 'wiktionary' | 'model' = etymology ? 'wiktionary' : 'model'
	const prompt = renderPrompt(template, promptValues(context, etymology ?? NO_DATA))
	const hash = promptHash(prompt, config.model, config.temperature, config.maxTokens)

	const record = await readCache(config.cacheDir, hash)
	if (record) {
		cached = true
		const parsed = parseModelAnswer(record.raw)
		const answer: ExplainAnswer = {
			word: record.word,
			lemma: record.lemma,
			grammar: context.grammar,
			meaning: record.answer.meaning,
			etymology: record.answer.etymology,
			example: record.answer.example,
			etymologySource: record.etymologySource,
			cached: true,
			parsed: parsed.parsed,
			retryAfter: 0,
			elapsedMs: 0
		}
		answer.elapsedMs = log(200)
		return json(answer)
	}

	const cookie = cookies.get(EXPLAIN_COOKIE)
	const decision = cookieDecision(cookie === undefined ? null : Number(cookie), Date.now())
	if (decision.limited) {
		return fail(
			429,
			{
				error: 'rate-limited',
				message: 'Не чаще одного объяснения в 2 минуты',
				retryAfter: decision.retryAfter
			},
			{ 'Retry-After': String(decision.retryAfter) }
		)
	}

	const acceptedAt = Date.now()
	let pending = inFlight.get(hash)
	const owner = pending === undefined
	if (!pending) {
		pending = produceAnswer(hash, prompt, config, context, etymologySource, slug, paragraph)
		inFlight.set(hash, pending)
	}

	let fresh: CacheRecord
	try {
		fresh = await pending
	} catch (error) {
		if (error instanceof ExplainHttpError) return fail(error.status, error.body)
		return fail(502, { error: 'upstream-error', message: UPSTREAM_MESSAGE })
	} finally {
		if (owner) inFlight.delete(hash)
	}

	const parsed = parseModelAnswer(fresh.raw)
	const elapsedMs = log(200)
	const answer: ExplainAnswer = {
		word: fresh.word,
		lemma: fresh.lemma,
		grammar: context.grammar,
		meaning: fresh.answer.meaning,
		etymology: fresh.answer.etymology,
		example: fresh.answer.example,
		etymologySource: fresh.etymologySource,
		cached: false,
		parsed: parsed.parsed,
		retryAfter: EXPLAIN_WINDOW_MS / 1000,
		elapsedMs
	}

	cookies.set(EXPLAIN_COOKIE, String(acceptedAt), {
		path: '/read',
		maxAge: EXPLAIN_WINDOW_MS / 1000,
		httpOnly: true,
		sameSite: 'lax',
		secure: url.protocol === 'https:'
	})
	return json(answer)
}

function readConfig(): Config {
	return {
		baseUrl: env.EXPLAIN_BASE_URL ?? '',
		apiKey: env.EXPLAIN_API_KEY ?? '',
		model: env.EXPLAIN_MODEL ?? '',
		promptPath: env.EXPLAIN_PROMPT_PATH || DEFAULT_PROMPT_PATH,
		timeoutMs: numberOr(env.EXPLAIN_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
		maxTokens: numberOr(env.EXPLAIN_MAX_TOKENS, DEFAULT_MAX_TOKENS),
		temperature: numberOr(env.EXPLAIN_TEMPERATURE, DEFAULT_TEMPERATURE),
		cacheDir: env.EXPLAIN_CACHE_DIR || DEFAULT_CACHE_DIR,
		wiktionaryUrl: env.EXPLAIN_WIKTIONARY_URL ?? DEFAULT_WIKTIONARY_URL,
		wiktionaryTimeoutMs: numberOr(env.EXPLAIN_WIKTIONARY_TIMEOUT_MS, DEFAULT_WIKTIONARY_TIMEOUT_MS),
		userAgent: env.EXPLAIN_USER_AGENT || DEFAULT_USER_AGENT
	}
}

function numberOr(value: string | undefined, fallback: number): number {
	const parsed = Number(value)
	return value !== undefined && value !== '' && Number.isFinite(parsed) ? parsed : fallback
}

async function produceAnswer(
	hash: string,
	prompt: string,
	config: Config,
	context: PromptContext,
	etymologySource: 'wiktionary' | 'model',
	slug: string,
	paragraph: number
): Promise<CacheRecord> {
	const reply = await callModel(config, prompt)
	if (reply.content === null || reply.content.trim() === '' || reply.finishReason === 'length') {
		throw new ExplainHttpError(502, { error: 'upstream-error', message: UPSTREAM_MESSAGE })
	}

	const parsed = parseModelAnswer(reply.content)
	const record: CacheRecord = {
		promptHash: hash,
		createdAt: new Date().toISOString(),
		slug,
		paragraph,
		ruSentence: context.ruSentence,
		word: context.word,
		lemma: context.lemma,
		model: config.model,
		etymologySource,
		answer: { meaning: parsed.meaning, etymology: parsed.etymology, example: parsed.example },
		raw: reply.content
	}
	await writeCache(config.cacheDir, hash, record)
	return record
}

async function callModel(
	config: Config,
	prompt: string
): Promise<{ content: string | null; finishReason: string | null }> {
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), config.timeoutMs)
	let text = ''
	try {
		const response = await fetch(`${config.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${config.apiKey}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				model: config.model,
				temperature: config.temperature,
				max_tokens: config.maxTokens,
				response_format: { type: 'json_object' },
				reasoning: { enabled: false },
				messages: [{ role: 'user', content: prompt }]
			}),
			signal: controller.signal
		})
		if (!response.ok) {
			throw new ExplainHttpError(502, { error: 'upstream-error', message: UPSTREAM_MESSAGE })
		}
		text = await response.text()
	} catch (error) {
		if (error instanceof ExplainHttpError) throw error
		if (controller.signal.aborted) {
			throw new ExplainHttpError(504, { error: 'timeout', message: TIMEOUT_MESSAGE })
		}
		throw new ExplainHttpError(502, { error: 'upstream-error', message: UPSTREAM_MESSAGE })
	} finally {
		clearTimeout(timer)
	}

	let payload: {
		choices?: { message?: { content?: unknown }; finish_reason?: unknown }[]
	}
	try {
		payload = JSON.parse(text)
	} catch {
		throw new ExplainHttpError(502, { error: 'upstream-error', message: UPSTREAM_MESSAGE })
	}

	const choice = payload.choices?.[0]
	const content = choice?.message?.content
	const finish = choice?.finish_reason
	return {
		content: typeof content === 'string' ? content : null,
		finishReason: typeof finish === 'string' ? finish : null
	}
}

async function lookupEtymology(config: Config, lemma: string): Promise<string | null> {
	const base = config.wiktionaryUrl.trim()
	if (base === '' || base.toLowerCase() === 'off') return null

	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), config.wiktionaryTimeoutMs)
	try {
		const url = new URL(base)
		url.searchParams.set('action', 'parse')
		url.searchParams.set('page', lemma)
		url.searchParams.set('prop', 'text')
		url.searchParams.set('format', 'json')
		url.searchParams.set('formatversion', '2')
		url.searchParams.set('redirects', '1')

		const response = await fetch(url, {
			headers: { 'User-Agent': config.userAgent },
			signal: controller.signal
		})
		if (!response.ok) return null
		const payload = (await response.json()) as { parse?: { text?: unknown } }
		const html = payload.parse?.text
		return typeof html === 'string' ? etymologyFromPage(html) : null
	} catch {
		return null
	} finally {
		clearTimeout(timer)
	}
}

async function readCache(dir: string, hash: string): Promise<CacheRecord | null> {
	try {
		const value = JSON.parse(await readFile(join(resolve(dir), `${hash}.json`), 'utf8')) as CacheRecord
		if (typeof value?.answer?.meaning !== 'string') return null
		return value
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
			console.warn(`explain: cache read failed for ${hash}: ${(error as Error).message}`)
		}
		return null
	}
}

async function writeCache(dir: string, hash: string, record: CacheRecord): Promise<void> {
	const target = join(resolve(dir), `${hash}.json`)
	try {
		await mkdir(resolve(dir), { recursive: true })
		await writeFile(`${target}.tmp`, JSON.stringify(record))
		await rename(`${target}.tmp`, target)
	} catch (error) {
		console.warn(`explain: cache write failed for ${hash}: ${(error as Error).message}`)
	}
}
