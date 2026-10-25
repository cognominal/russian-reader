import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { spawn, type ChildProcess } from 'node:child_process';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { pairGroupFor } from '../src/lib/article';
import type { Article } from '../src/lib/article';
import article24034 from '../src/lib/content/24034.json';
import article66181 from '../src/lib/content/66181.json';

const a24034 = article24034 as unknown as Article;
const a66181 = article66181 as unknown as Article;
const para = (a: Article, i: number) => a.paragraphs.find((p) => p.i === i)!;

describe('pairGroupFor', () => {
	test('a merge closes over every Russian sentence that shares the English one', () => {
		expect(pairGroupFor(para(a24034, 30), 2)).toEqual({ ru: [2, 3, 4], en: [2] });
		expect(pairGroupFor(para(a66181, 2), 5)).toEqual({ ru: [5, 6], en: [5] });
	});

	test('a split keeps the one Russian sentence and every English one', () => {
		expect(pairGroupFor(para(a24034, 20), 1)).toEqual({ ru: [1], en: [1, 2, 3] });
	});

	test('a one-to-one row is a group of one, and an absent row has no English side', () => {
		expect(pairGroupFor(para(a24034, 1), 0)).toEqual({ ru: [0], en: [0] });
		expect(pairGroupFor(para(a24034, 1), 999)).toEqual({ ru: [999], en: [] });
	});
});

const PORT = 4173;
const BASE = `http://127.0.0.1:${PORT}`;

let server: ChildProcess | null = null;
let browser: Browser | null = null;
let page: Page;

async function waitForServer(url: string): Promise<void> {
	for (let k = 0; k < 120; k++) {
		try {
			const response = await fetch(url);
			if (response.ok) return;
		} catch {
			// not up yet
		}
		await Bun.sleep(250);
	}
	throw new Error(`dev server did not come up at ${url}`);
}

async function open(slug: string): Promise<void> {
	await page.goto(`${BASE}/read/${slug}`, { waitUntil: 'networkidle0' });
	await page.waitForSelector('.pane-ru article [data-sent]');
}

/** Pick a Russian sentence in the article pane and wait for the pane to show it. */
async function pick(paragraph: number, sentence: number): Promise<void> {
	await page.click(`.pane-ru article [data-para="${paragraph}"] [data-sent="${sentence}"]`);
	await page.waitForFunction(
		(s) =>
			document
				.querySelector('.en-sentence .line[lang="ru"] .sent[aria-current="true"]')
				?.getAttribute('data-sent') === String(s),
		{},
		sentence
	);
}

type PaneState = {
	header: string | null;
	ru: { sentence: string | null; text: string; tint: boolean; dim: boolean }[];
	en: { sentence: string | null; text: string; dim: boolean }[];
};

function pane(): Promise<PaneState> {
	return page.evaluate(() => {
		const head = document.querySelector('.en-sentence .head .sent-no');
		const ru = [...document.querySelectorAll('.en-sentence .line[lang="ru"] .sent')];
		const en = [...document.querySelectorAll('.en-sentence .line[lang="en"] .en-sent')];
		return {
			header: head?.textContent ?? null,
			ru: ru.map((el) => ({
				sentence: el.getAttribute('data-sent'),
				text: (el.textContent ?? '').trim(),
				tint: el.classList.contains('tint'),
				dim: el.classList.contains('dim')
			})),
			en: en.map((el) => ({
				sentence: el.getAttribute('data-sent'),
				text: (el.textContent ?? '').trim(),
				dim: el.classList.contains('dim')
			}))
		};
	});
}

beforeAll(async () => {
	server = spawn('bun', ['run', 'dev', '--', '--port', String(PORT), '--host', '127.0.0.1'], {
		stdio: 'ignore',
		detached: true
	});
	await waitForServer(`${BASE}/read/66181`);
	browser = await puppeteer.launch({
		executablePath: process.env.CHROME_PATH ?? '/usr/bin/chromium',
		headless: true,
		args: ['--no-sandbox']
	});
	page = await browser.newPage();
	await page.setViewport({ width: 1280, height: 900 });
}, 60000);

afterAll(async () => {
	await browser?.close();
	if (server?.pid !== undefined) {
		try {
			process.kill(-server.pid, 'SIGTERM');
		} catch {
			// already gone
		}
	}
});

test('a merge shows every Russian sentence, current tinted and the rest dimmed', async () => {
	await open('66181');
	await pick(2, 6);
	const state = await pane();
	expect(state.header).toBe('предложения 6–7 · sentences 6–7');
	expect(state.ru.map((s) => s.sentence)).toEqual(['5', '6']);
	expect(state.ru.find((s) => s.sentence === '6')).toMatchObject({ tint: true, dim: false });
	expect(state.ru.find((s) => s.sentence === '5')).toMatchObject({ tint: false, dim: true });
	expect(state.ru[1].text).toContain('А как сверхзадача');
	expect(state.en).toHaveLength(1);
	expect(state.en[0].text).toContain('Hence the attempts');
	expect(state.en[0].dim).toBe(false);
}, 30000);

test('a split shows one Russian sentence and every English sentence at full contrast', async () => {
	await open('24034');
	await pick(20, 1);
	const state = await pane();
	expect(state.header).toBe('предложение 2 · sentence 2');
	expect(state.ru).toHaveLength(1);
	expect(state.ru[0]).toMatchObject({ sentence: '1', tint: true, dim: false });
	expect(state.en.map((s) => s.sentence)).toEqual(['1', '2', '3']);
	expect(state.en.every((s) => !s.dim)).toBe(true);
	expect(state.en[2].text).toContain('This is visible in');
}, 30000);

test('a three-sentence merge marks exactly one current member and the range in the header', async () => {
	await open('24034');
	await pick(30, 2);
	const state = await pane();
	expect(state.header).toBe('предложения 3–5 · sentences 3–5');
	expect(state.ru.map((s) => s.sentence)).toEqual(['2', '3', '4']);
	expect(state.ru.filter((s) => s.tint).map((s) => s.sentence)).toEqual(['2']);
	expect(state.ru.filter((s) => s.dim).map((s) => s.sentence)).toEqual(['3', '4']);
	expect(state.en.map((s) => s.sentence)).toEqual(['2']);
}, 30000);

test('Tab moves the tint within the group and Shift+Tab brings it back', async () => {
	await open('24034');
	await pick(30, 2);
	await page.keyboard.press('Tab');
	const second = await pane();
	expect(second.header).toBe('предложения 3–5 · sentences 3–5');
	expect(second.ru.filter((s) => s.tint).map((s) => s.sentence)).toEqual(['3']);
	await page.keyboard.down('Shift');
	await page.keyboard.press('Tab');
	await page.keyboard.up('Shift');
	const back = await pane();
	expect(back.ru.filter((s) => s.tint).map((s) => s.sentence)).toEqual(['2']);
}, 30000);

test('a word clicked in a dimmed member makes its own sentence current', async () => {
	await open('24034');
	await pick(30, 2);

	const answer = {
		word: 'можем',
		lemma: 'мочь',
		grammar: 'VERB,impf',
		meaning: 'быть в состоянии',
		etymology: null,
		example: null,
		etymologySource: 'model',
		sourceText: null,
		sourceUrl: null,
		sourceExists: null,
		cached: true,
		parsed: true,
		retryAfter: 60,
		elapsedMs: 1
	};
	await page.setRequestInterception(true);
	page.on('request', (request) => {
		if (request.method() === 'POST' && request.url().includes('/explain')) {
			void request.respond({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(answer)
			});
			return;
		}
		void request.continue();
	});

	await page.click('.en-sentence .line[lang="ru"] .sent.dim button.tok');
	await page.waitForFunction(
		() =>
			document
				.querySelector('.en-sentence .line[lang="ru"] .sent[aria-current="true"]')
				?.getAttribute('data-sent') === '3',
		{}
	);
	const state = await pane();
	expect(state.ru.filter((s) => s.tint).map((s) => s.sentence)).toEqual(['3']);
	expect(state.ru.filter((s) => s.dim).map((s) => s.sentence)).toEqual(['2', '4']);
}, 30000);

test('a glossary sentence with no translation keeps the one-sentence pane and the note', async () => {
	await open('glossary');
	await pick(8, 1);
	const state = await pane();
	expect(state.header).toBe('предложение 2 · sentence 2');
	expect(state.ru).toHaveLength(1);
	const note = await page.$eval('.en-sentence .note', (el) => el.textContent ?? '');
	expect(note).toContain('Перевода этой фразы в паре нет');
}, 30000);
