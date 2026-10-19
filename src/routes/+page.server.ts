import { loadCatalog } from '$lib/server/catalog';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const { entries, generated } = await loadCatalog();
	return { articles: entries, catalogGenerated: generated };
};
