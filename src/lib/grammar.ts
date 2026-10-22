import entryIds from './grammeme-entries.json';

/**
 * What the grammar chip's codes mean, in the reader's own language.
 *
 * The table is the pymorphy3 dictionary's own `grammemes.json` (name → Russian
 * name) minus its category nodes (`POST`, `CAse`, `NMbr`, …), which never appear
 * in a tag string. It is complete on purpose: a tag is a closed external
 * vocabulary, and the popup has to explain any of it, not only the tags that
 * happen to occur in today's two articles. Where the dictionary's name is itself
 * jargon or a Latin term (`Sgtm`, `Subx`), the gloss says what the form *is* —
 * this is UI copy for a learner, not a mirror of the dictionary.
 *
 * Those names come from OpenCorpora (http://opencorpora.org, CC BY-SA) through
 * pymorphy3-dicts (MIT), so this table is the one thing in the repository the
 * MIT `LICENSE` does not cover — see that file for the credit.
 */
const GLOSS_BY_CODE: Record<string, string> = {
	// parts of speech
	NOUN: 'имя существительное',
	ADJF: 'имя прилагательное (полное)',
	ADJS: 'имя прилагательное (краткое)',
	COMP: 'компаратив',
	VERB: 'глагол (личная форма)',
	INFN: 'глагол (инфинитив)',
	PRTF: 'причастие (полное)',
	PRTS: 'причастие (краткое)',
	GRND: 'деепричастие',
	NUMR: 'числительное',
	ADVB: 'наречие',
	NPRO: 'местоимение-существительное',
	PRED: 'предикатив',
	PREP: 'предлог',
	CONJ: 'союз',
	PRCL: 'частица',
	INTJ: 'междометие',

	// animacy, gender, number, case
	anim: 'одушевлённое',
	inan: 'неодушевлённое',
	masc: 'мужской род',
	femn: 'женский род',
	neut: 'средний род',
	'ms-f': 'общий род (м/ж)',
	'Ms-f': 'колебание по роду (м/ж/с)',
	sing: 'единственное число',
	plur: 'множественное число',
	Sgtm: 'только единственное число',
	Pltm: 'только множественное число',
	nomn: 'именительный падеж',
	gent: 'родительный падеж',
	datv: 'дательный падеж',
	accs: 'винительный падеж',
	ablt: 'творительный падеж',
	loct: 'предложный падеж',
	voct: 'звательный падеж',
	gen1: 'первый родительный падеж',
	gen2: 'второй родительный (частичный) падеж',
	acc2: 'второй винительный падеж',
	loc1: 'первый предложный падеж',
	loc2: 'второй предложный (местный) падеж',

	// aspect, transitivity, voice, person, tense, mood, involvement
	perf: 'совершенный вид',
	impf: 'несовершенный вид',
	tran: 'переходный',
	intr: 'непереходный',
	actv: 'действительный залог',
	pssv: 'страдательный залог',
	'1per': '1 лицо',
	'2per': '2 лицо',
	'3per': '3 лицо',
	pres: 'настоящее время',
	past: 'прошедшее время',
	futr: 'будущее время',
	indc: 'изъявительное наклонение',
	impr: 'повелительное наклонение',
	incl: 'говорящий включён в действие',
	excl: 'говорящий не включён в действие',

	// lexical and stylistic markers
	Abbr: 'аббревиатура',
	Name: 'имя',
	Surn: 'фамилия',
	Patr: 'отчество',
	Geox: 'топоним',
	Orgn: 'организация',
	Trad: 'торговая марка',
	Init: 'инициал',
	Fixd: 'неизменяемое',
	Subx: 'может употребляться как существительное',
	Adjx: 'может выступать в роли прилагательного',
	Prdx: 'может выступать в роли предикатива',
	Inmx: 'может использоваться как одушевлённое или неодушевлённое',
	Qual: 'качественное',
	Apro: 'местоименное',
	Anum: 'порядковое',
	Poss: 'притяжательное',
	Anph: 'анафорическое (местоимение)',
	Dmns: 'указательное',
	Ques: 'вопросительное',
	Prnt: 'вводное слово',
	Supr: 'превосходная степень',
	Cmp2: 'сравнительная степень на по-',
	Coun: 'счётная форма',
	Coll: 'собирательное числительное',
	Mult: 'многократный',
	Refl: 'возвратный',
	Impe: 'безличный',
	Impx: 'возможно безличное употребление',
	Hypo: 'гипотетическая форма',
	Infr: 'разговорное',
	Slng: 'жаргонное',
	Arch: 'устаревшее',
	Litr: 'литературный вариант',
	Erro: 'опечатка',
	Dist: 'искажение',
	'Af-p': 'форма после предлога',
	Vpre: 'вариант предлога (со, подо…)',
	'V-ey': 'форма на -ею',
	'V-oy': 'форма на -ою',
	'V-ej': 'форма компаратива на -ей',
	'V-be': 'форма на -ье',
	'V-en': 'форма на -енен',
	'V-ie': 'форма на -и- (веселие, твёрдостию); отчество с -ие',
	'V-bi': 'форма на -ьи',
	'V-sh': 'деепричастие на -ши',
	Fimp: 'деепричастие от глагола несовершенного вида'
}

export type TagPart = {
	/** The code as the tag string spells it. */
	tag: string
	/** What it means, or `null` for a code this table does not know. */
	gloss: string | null
	/**
	 * The glossary entry that explains this code, by its id, or `null` when the
	 * glossary has no entry for it. A code with no entry keeps its plain gloss: a
	 * link to an entry that does not explain the code is worse than no link.
	 */
	entry: string | null
}

/**
 * Which glossary entry explains each code, by the entry's id.
 *
 * Authored by hand from the table above, one line per code, and read from a JSON
 * file because `scripts/check_glossary.py` has to check it too: every id here must
 * exist as an anchor in the built glossary article, and a regenerated glossary can
 * drop one. A code the table above glosses but this map does not name keeps its
 * plain gloss — `NUMR`, `Dmns` and `Prnt` have no entry of their own, and the
 * glossary does not explain them.
 */
const ENTRY_BY_CODE: Record<string, string> = entryIds

/**
 * One entry per component, in the tag's own order: the string is already
 * ordered the way a learner reads it (part of speech, then aspect and
 * transitivity, then gender, number, case, tense, mood).
 *
 * `UNKN` is not a grammeme — it is what pymorphy3 returns for a form that is not
 * in its dictionary — so it gets its own sentence instead of a lookup.
 */
export function tagParts(tag: string): TagPart[] {
	if (tag === 'UNKN') return [{ tag, gloss: 'не разобрано: формы нет в словаре', entry: null }]

	const parts: TagPart[] = []
	for (const group of tag.split(' ')) {
		for (const part of group.split(',')) {
			if (part === '') continue
			parts.push({ tag: part, gloss: GLOSS_BY_CODE[part] ?? null, entry: ENTRY_BY_CODE[part] ?? null })
		}
	}
	return parts
}
