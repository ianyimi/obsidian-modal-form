import { A, pipe } from "@std";
import { absurd } from "fp-ts/function";
import { App } from "obsidian";
import { multiselect, inputTag } from "src/core/InputDefinitionSchema";
import { executeSandboxedDvQuery, sandboxedDvQuery } from "src/suggesters/SafeDataviewQuery";
import { StringSuggest } from "src/suggesters/StringSuggest";
import { FileSuggest } from "src/suggesters/suggestFile";
import { Writable, writable } from "svelte/store";

export interface MultiSelectModel {
    createInput(element: HTMLInputElement): void;
    removeValue(value: string): void;
}

export function MultiSelectModel(
    fieldInput: multiselect,
    app: App,
    values: Writable<string[]>,
): MultiSelectModel {
    const source = fieldInput.source;
    const removeValue = (value: string) => {
        values.update((xs) =>
            pipe(
                xs,
                A.filter((x) => x !== value),
            ),
        );
    };
    const remainingOptions = writable(new Set<string>());
    async function updateRemainingOptions() {
        if (source === "fixed") {
            remainingOptions.set(new Set(fieldInput.multi_select_options));
            return;
        }
        if (source === "dataview") {
            remainingOptions.set(
                new Set(await executeSandboxedDvQuery(sandboxedDvQuery(fieldInput.query), app)),
            );
        }
    }
    updateRemainingOptions();
    switch (source) {
        case "dataview":
        case "fixed": {
            return {
                createInput(element: HTMLInputElement) {
                    const unsubscribe = remainingOptions.subscribe((options) => {
                        new StringSuggest(
                            element,
                            options,
                            (selected) => {
                                remainingOptions.update((opts) => {
                                    opts.delete(selected);
                                    return opts;
                                });
                                values.update((x) => [...x, selected]);
                            },
                            app,
                            fieldInput.allowUnknownValues,
                        );
                    });
                    return () => unsubscribe();
                },
                removeValue(value: string) {
                    remainingOptions.update((opts) => {
                        opts.add(value);
                        return opts;
                    });
                    values.update((currentValues) => currentValues.filter((v) => v !== value));
                },
            };
        }
        case "notes": {
            return {
                createInput(element: HTMLInputElement) {
                    new FileSuggest(
                        app,
                        element,
                        {
                            renderSuggestion(file) {
                                return file.basename;
                            },
                            selectSuggestion(file) {
                                values.update((x) => [...x, file.basename]);
                                return "";
                            },
                        },
                        fieldInput.folder,
                    );
                },
                removeValue,
            };
        }
        default:
            return absurd(source);
    }
}

export function MultiSelectTags(
    fieldInput: inputTag,
    app: App,
    values: Writable<string[]>,
): MultiSelectModel {
    const remainingOptions = new Set(
        Object.keys(app.metadataCache.getTags()).map(
            (tag) => tag.slice(1) /** remove the leading # */,
        ),
    );
    return {
        createInput(element: HTMLInputElement) {
            new StringSuggest(
                element,
                remainingOptions,
                (selected) => {
                    remainingOptions.delete(selected);
                    values.update((x) => [...x, selected]);
                },
                app,
                true,
            );
        },
        removeValue(value: string) {
            remainingOptions.add(value);
            values.update((x) =>
                pipe(
                    x,
                    A.filter((x) => x !== value),
                ),
            );
        },
    };
}
