export type JsonPrimitive = string | number | boolean | null;

export type JsonArray = readonly JsonValue[];

export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export type JsonValue = JsonPrimitive | JsonArray | JsonObject;

/** Recursively prevents mutation of a JSON-compatible contract value. */
export type ImmutableJson<T> = T extends JsonPrimitive
  ? T
  : T extends readonly (infer TItem)[]
    ? readonly ImmutableJson<TItem>[]
    : T extends object
      ? { readonly [TKey in keyof T]: ImmutableJson<T[TKey]> }
      : never;
