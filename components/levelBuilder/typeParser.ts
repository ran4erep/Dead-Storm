import templates from './templates.json';

export function getTemplateFor(category: string): any {
    let key = category;
    if (key === 'buffs') key = 'de-buffs';
    if (key in templates) {
        return JSON.parse(JSON.stringify((templates as any)[key]));
    }
    return null;
}
