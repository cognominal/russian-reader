import { redirect } from '@sveltejs/kit';

/**
 * The glossary was a page of its own; it is an article now, read at
 * `/read/glossary` with the same panes, the same Tab stepping and the same
 * explanations as any other text. The redirect is permanent, because the old
 * URL is the one in every bookmark and every link the explanation pane ever
 * pointed at, and it will never mean anything else again.
 */
export const load = () => {
	redirect(308, '/read/glossary');
};
