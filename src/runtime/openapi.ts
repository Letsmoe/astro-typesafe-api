export type OpenAPIExternalDocsObject = {
	description?: string,
	url?: string
}

export type OpenAPIReferenceObject = {
	$ref: string,
	summary?: string,
	description?: string
}

export type OpenAPIParameterObject = {
	name: string,
	in: "header" | "query" | "path" | "cookie",
	description?: string,
	required?: boolean,
	deprecated?: boolean,
	allowEmptyValue?: boolean,
	examples?: Record<string, OpenAPIExampleObject>
}

export type OpenAPIExampleObject = {
	summary?: string,
	description?: string,
	value?: any,
	externalValue?: string,
	$ref?: string
}

export type OpenAPIMeta = {
	summary?: string,
	description?: string,
	externalDocs?: OpenAPIExternalDocsObject
	headers?: Record<string, Omit<Omit<OpenAPIParameterObject, "name">, "in"> | OpenAPIReferenceObject>
}