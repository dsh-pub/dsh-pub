import type { ReactNode } from 'react';
export type Translate = (key: string, params?: Record<string, unknown>) => string;
export interface DirectorySectionProps {
    close?: () => void;
    t: Translate;
}
interface DshLocaleService {
    register(namespace: string, dictionaries: {
        en: Record<string, string>;
        zh: Record<string, string>;
    }): () => void;
    bind(namespace: string): Translate;
}
interface SettingsSectionOptions {
    name: 'settings.section';
    id: string;
    order: number;
    label: () => string;
    locale: string;
}
interface DshSlotsService {
    inject(name: 'settings.section', register: () => unknown): void;
    register(options: SettingsSectionOptions, component: (props: DirectorySectionProps) => ReactNode): () => void;
}
export interface DshClientContext {
    effect(factory: () => void | (() => void), label: string): void;
    locale: DshLocaleService;
    slots: DshSlotsService;
}
export {};
