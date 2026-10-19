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
 */
const GLOSS: Record<string, string> = {
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
}

/**
 * One entry per component, in the tag's own order: the string is already
 * ordered the way a learner reads it (part of speech, then aspect and
 * transitivity, then gender, number, case, tense, mood).
 *
 * `UNKN` is not a grammeme — it is what pymorphy3 returns for a form that is not
 * in its dictionary — so it gets its own sentence instead of a lookup.
 */
export function tagParts(tag: string): TagPart[] {
	if (tag === 'UNKN') return [{ tag, gloss: 'не разобрано: формы нет в словаре' }]

	const parts: TagPart[] = []
	for (const group of tag.split(' ')) {
		for (const part of group.split(',')) {
			if (part === '') continue
			parts.push({ tag: part, gloss: GLOSS[part] ?? null })
		}
	}
	return parts
}
