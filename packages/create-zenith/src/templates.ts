export type TemplateName = 'basic' | 'css' | 'tailwind'

export type TemplateDefinition = {
    name: TemplateName
    label: string
    hint: string
    templatePath: string
    usesTailwind: boolean
}

export const DEFAULT_TEMPLATE: TemplateName = 'css'

const TEMPLATE_DEFINITIONS: Record<TemplateName, TemplateDefinition> = {
    basic: {
        name: 'basic',
        label: 'Basic',
        hint: 'Blank starter with a single page and minimal CSS',
        templatePath: 'templates/basic',
        usesTailwind: false
    },
    css: {
        name: 'css',
        label: 'CSS',
        hint: 'Multi-page starter with a small curated CSS setup',
        templatePath: 'templates/css',
        usesTailwind: false
    },
    tailwind: {
        name: 'tailwind',
        label: 'Tailwind',
        hint: 'Multi-page starter with Tailwind enabled',
        templatePath: 'templates/tailwind',
        usesTailwind: true
    }
}

const TEMPLATE_ALIASES: Record<string, TemplateName> = {
    starter: 'css',
    'starter-tailwindcss': 'tailwind'
}

export function resolveTemplateName(value: string | null | undefined): TemplateName | null {
    const normalized = String(value || '').trim().toLowerCase()
    if (!normalized) {
        return null
    }

    if (normalized in TEMPLATE_DEFINITIONS) {
        return normalized as TemplateName
    }

    return TEMPLATE_ALIASES[normalized] || null
}

export function getTemplateDefinition(templateName: TemplateName): TemplateDefinition {
    return TEMPLATE_DEFINITIONS[templateName]
}

export function templateSelectOptions(): Array<{ value: TemplateName; label: string; hint: string }> {
    return Object.values(TEMPLATE_DEFINITIONS).map((definition) => ({
        value: definition.name,
        label: definition.label,
        hint: definition.hint
    }))
}
