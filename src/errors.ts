export class TypesafeAPIError<Cause = unknown> extends Error {
    name = "TypesafeAPIError"
    cause: Cause
    constructor(cause: Cause, ...messages: string[]) {
        super(messages.join("\n\n"), { cause })
        this.cause = cause
    }
}

export class MissingHTTPVerb extends TypesafeAPIError<undefined> {
    name = "TypesafeAPIError.MissingHTTPVerb" as const
    constructor(endpoint: string) {
        super(
            undefined,
            `Request to endpoint ${endpoint} cannot be made because the method is missing.`,
            "When targetting the ALL API Route handler, the method must be provided in options."
        )
    }
}

export class IncorrectHTTPVerb extends TypesafeAPIError<undefined> {
    name = "TypesafeAPIError.IncorrectHTTPVerb" as const
    constructor(verb: string, endpoint: string) {
        super(
            undefined,
            `Request to endpoint ${endpoint} cannot be made because the method (${verb}) is not valid.`,
            "The method must be uppercase and directly precede fetch()."
        )
    }
}

export class ResponseNotOK extends TypesafeAPIError<Response> {
    name = "TypesafeAPIError.ResponseNotOK" as const
    constructor(response: Response) {
        super(
            response,
            `The API call was unsuccessful: ${response.statusText ?? response.status}.`,
            "See `error.cause` for the full response.",
        )
    }
}

export class UnknownResponseFormat extends TypesafeAPIError<Response> {
    name = "TypesafeAPIError.UnknownResponseFormat" as const
    constructor(response: Response) {
        super(
            response,
            `The API call to ${response.url} was successfull, but the server responded with an unexpected format: ${response.headers.get("Content-Type")}.`,
            "See `error.cause` for the full response.",
        )
    }
}

export class ZodNotInstalled extends TypesafeAPIError<undefined> {
    name = "TypesafeAPIError.ZodNotInstalled" as const
    constructor() {
        super(
            undefined,
            "API Route defines a schema, but zod is not installed.",
            "Schema validation is an optional feature that requires zod to be installed in your project",
            "Please try again after running `npm install zod`."
        )
    }
}

export class InvalidSchema extends TypesafeAPIError<unknown> {
    name = "TypesafeAPIError.InvalidSchema" as const
    constructor(invalidSchema: unknown) {
        super(
            invalidSchema,
            "API Route defines a schema, but the schema is not a valid zod schema.",
            "The schema must be an instance of ZodType."
        )
    }
}

export class InputValidationFailed extends TypesafeAPIError {
    name = "TypesafeAPIError.ValidationFailed" as const
    constructor(cause: unknown, url: string) {
        super(
            cause,
            `The API Route failed to process the  request for ${url}.`,
            "The input for the fetch handler failed to validate against the schema.",
            String(cause),
            "See `error.cause` for more details."
        )
    }
}

export class InvalidHeaderEncountered extends TypesafeAPIError {
		name = "TypesafeAPIError.InvalidHeaderEncountered" as const
		constructor(cause: unknown, url: string) {
				super(
						cause,
						`The API Route failed to process the  request for ${url}.`,
						"A header failed to validate against the schema.",
						String(cause),
						"See `error.cause` for more details."
				)
		}
}

export class OutputValidationFailed extends TypesafeAPIError {
	name = "TypesafeAPIError.OutputValidationFailed" as const
	constructor(cause: unknown, url: string) {
			super(
					cause,
					`The API Route failed to process the request for ${url}.`,
					"The output for the fetch handler failed to validate against the schema.",
					String(cause),
					"See `error.cause` for more details."
			)
	}
}

export class AcceptHeaderMissing extends TypesafeAPIError<Request> {
    name = "TypesafeAPIError.AcceptHeaderMissing" as const
    constructor(request: Request) {
        super(
            request,
            `The API call to ${request.url} was invalid.`,
            "The request must include an `Accept` header.",
            "See `error.cause` for the full request."
        )
    }
}

export class UnsupportedClient extends TypesafeAPIError<Request> {
    name = "TypesafeAPI.UnsupportedClient" as const
    constructor(request: Request) {
        super(
            request,
            `The API request to ${request.url} was made by an unsupported client.`,
            "The request's `Accept` header must include either `application/json` or `application/escodec`.",
            `${JSON.stringify(request.headers.get("Accept"))} included neither.`,
            "See `error.cause` for the full request."
        )
    }
}

export class UnknownRequestFormat extends TypesafeAPIError<Request> {
    name = "TypesafeAPI.UnknownRequestFormat" as const
    constructor(request: Request) {
        super(
            request,
            `The API request to ${request.url} was invalid.`,
            "Request format was neither JSON nor es-codec.",
            "`Content-Type` header must be either `application/json` or `application/escodec`.",
            `Instead, it was ${JSON.stringify(request.headers.get("Content-Type"))}.`,
            "See `error.cause` for the full request."
        )
    }
}

export class InputNotDeserializable extends TypesafeAPIError {
    name = "TypesafeAPIError.InputNotDeserializable" as const
    constructor(cause: unknown, url: string) {
        super(
            cause,
            `The API Route failed to process the  request for ${url}.`,
            "The input for the fetch handler could not be parsed from the request.",
            String(cause),
            "See `error.cause` for more details."
        )
    }
}

export class ProcedureFailed extends TypesafeAPIError {
    name = "TypesafeAPIError.ProcedureFailed" as const
    constructor(cause: unknown, url: string) {
        super(
            cause,
            `The API Route failed to process the  request for ${url}.`,
            String(cause),
            "See `error.cause` for more details"
        )
    }
}

export class OutputNotSerializable extends TypesafeAPIError {
    name = "TypesafeAPIError.OutputNotSerializable" as const
    constructor(cause: unknown, url: string) {
        super(
            cause,
            `The API Route failed to process the  request for ${url}.`,
            "The output from fetch handler could not be serialized.",
            String(cause),
            "See `error.cause` for more details.",
        )
    }
}

