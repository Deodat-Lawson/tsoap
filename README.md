# typed-soap

[![npm typed-soap](https://img.shields.io/npm/v/typed-soap)](https://www.npmjs.com/package/typed-soap)
[![npm tsoap-cli](https://img.shields.io/npm/v/tsoap-cli)](https://www.npmjs.com/package/tsoap-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**End-to-end type-safe SOAP client for TypeScript. Like tRPC, but for WSDL.**

---

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [How to use typed-soap](#how-to-use-typed-soap)
- [CLI Reference](#cli-reference)
- [Runtime API](#runtime-api)
- [Supported XSD Types](#supported-xsd-types)
- [typed-soap vs the soap package](#typed-soap-vs-the-soap-package)
- [How It Works](#how-it-works)
- [Examples](#examples)
- [Support](#support)
- [Contributing](#contributing)

## Overview

Legacy SOAP APIs are everywhere, but calling them from TypeScript is painful: no autocomplete, no type checking, and lots of manual XML wrangling.

**typed-soap** fixes this with a two-phase approach:

1. **Generate** (`tsoap-cli`) — Point the CLI at a WSDL file and it generates TypeScript interfaces, a service definition type, and a typed factory function.
2. **Use** (`typed-soap`) — Import the generated factory, get a fully typed client with autocomplete on every service, port, and operation.

See [How to use typed-soap](#how-to-use-typed-soap) for a step-by-step guide.

```
weather.wsdl  -->  tsoap generate  -->  generated/weather.ts  -->  your app (fully typed)
```

## Quick Start

**Requirements:** Node.js 18+, TypeScript 5.x (optional, for type generation)

### Install

```bash
npm install typed-soap
npm install -D tsoap-cli
```

### Generate types from a WSDL

```bash
npx tsoap generate --input ./weather.wsdl --output ./generated
```

### Use the typed client

```typescript
import { createWeatherServiceClient } from './generated/weather.js';

const client = await createWeatherServiceClient('http://example.com/weather?wsdl');
const result = await client.WeatherService.WeatherPort.GetWeather({ city: 'NYC' });

console.log(result.temperature); // number
console.log(result.description); // string
```

Every property is fully typed. Typos in service names, port names, operation names, or arguments are caught at compile time.

## How to use typed-soap

### 1. Generate types (one-time or when WSDL changes)

```bash
npx tsoap generate --input ./path/to/your.wsdl --output ./generated
```

This creates `generated/your.ts` (named after the input file) with TypeScript interfaces and a factory function. The factory name is derived from the WSDL service (e.g. `WeatherService` → `createWeatherServiceClient`).

### 2. Create the client

```typescript
import { createWeatherServiceClient } from './generated/weather.js';

const client = await createWeatherServiceClient('https://api.example.com/weather?wsdl');
```

### 3. Call operations

Use the three-level path: **Service → Port → Operation**. Pass a plain object as input; get a typed result.

```typescript
// client.ServiceName.PortName.OperationName(input)
const result = await client.WeatherService.WeatherPort.GetWeather({ city: 'NYC' });
//    ^? { temperature: number; description: string; ... }

const order = await client.OrderService.OrderPort.CreateOrder({
  customerId: 123,
  items: [{ sku: 'ABC', quantity: 2 }],
});
//    ^? { orderId: number; status: "PENDING" | "SHIPPED"; ... }
```

### 4. Override the endpoint (optional)

If the WSDL points to a different URL than your runtime endpoint:

```typescript
import { createSoapClient } from 'typed-soap';
import type { WeatherServiceDefinition } from './generated/weather.js';

const client = await createSoapClient<WeatherServiceDefinition>(wsdlUrl, {
  endpoint: 'https://production.example.com/soap',
});
```

### Call pattern summary

| Step | Code |
|------|------|
| Create client | `const client = await createXxxClient(wsdlUrl)` |
| Call operation | `const result = await client.Service.Port.Operation(input)` |
| Input | Plain object matching the WSDL request schema |
| Output | Typed object; `await` returns the result directly (no tuple) |

## CLI Reference

```
tsoap generate --input <path-or-url> --output <dir>
```

| Flag | Description |
|------|-------------|
| `-i, --input <path>` | Path or URL to the WSDL file (required) |
| `-o, --output <dir>` | Output directory for generated TypeScript files (required) |

The CLI creates one `.ts` file per WSDL, named after the input file (e.g. `weather.wsdl` produces `weather.ts`).

## Runtime API

### `createSoapClient<T>(wsdlUrl, options?)`

The core function exported from `typed-soap`. The generic parameter `T` is a generated `ServiceDefinition` type.

```typescript
import { createSoapClient } from 'typed-soap';
import type { MyServiceDefinition } from './generated/my-service.js';

const client = await createSoapClient<MyServiceDefinition>(
  'http://example.com/service?wsdl',
  { endpoint: 'http://override-endpoint.com/service' }
);
```

**Options** extend the `soap` package's `IOptions` with:

| Option | Type | Description |
|--------|------|-------------|
| `endpoint` | `string` | Override the SOAP endpoint URL from the WSDL |

All standard `soap` options (like `wsdl_headers`, `wsdl_options`, etc.) are also supported.

### Generated factory functions

Each generated file exports a convenience factory so you don't need to pass the generic parameter manually:

```typescript
// Instead of:
import { createSoapClient } from 'typed-soap';
import type { WeatherServiceDefinition } from './generated/weather.js';
const client = await createSoapClient<WeatherServiceDefinition>(url);

// Just use:
import { createWeatherServiceClient } from './generated/weather.js';
const client = await createWeatherServiceClient(url);
```

## Supported XSD Types

| XSD Type | TypeScript | Notes |
|----------|-----------|-------|
| `int`, `short`, `byte`, `float`, `double` | `number` | Safe, fits within JS number |
| `unsignedInt`, `unsignedShort`, `unsignedByte` | `number` | Safe, custom deserializer applied |
| `long`, `unsignedLong`, `integer`, `decimal` | `number` | Precision risk for large values |
| `negativeInteger`, `nonNegativeInteger`, `positiveInteger`, `nonPositiveInteger` | `number` | Custom deserializer applied |
| `boolean` | `boolean` | |
| `dateTime`, `date` | `Date` | Parsed by soap via `new Date()` |
| `time`, `duration`, `gYear`, `gYearMonth`, `gMonth`, `gMonthDay`, `gDay` | `string` | No native JS equivalent |
| `string`, `normalizedString`, `token`, `language`, `Name`, `NCName`, `NMTOKEN`, `ID`, `IDREF`, `ENTITY`, `anyURI`, `QName`, `NOTATION` | `string` | |
| `base64Binary`, `hexBinary` | `string` | Encoded as text in XML |
| `anyType` | `unknown` | |
| Enumerations | Union type | e.g. `"PENDING" \| "SHIPPED"` |
| Arrays (`maxOccurs="unbounded"`) | `T[]` | |
| Optional (`minOccurs="0"`) | `T \| undefined` | Optional property |

## typed-soap vs the `soap` package

typed-soap wraps the battle-tested [node-soap](https://github.com/vpulim/node-soap) library and improves the developer experience in several ways:

| Aspect | `soap` package | typed-soap |
|--------|----------------|------------|
| **Return value** | Returns `[result, rawResponse, soapHeader, rawRequest]` — you must destructure and ignore the rest | Returns only the result; no tuple unwrapping |
| **Async API** | Callback-based by default; `*Async` methods return Promises but still resolve to a 4-tuple | All operations are `async` and return the result directly |
| **Type safety** | No types; everything is `any` | Full end-to-end types generated from WSDL |
| **Autocomplete** | None | Service, port, and operation names are autocompleted |
| **Typos** | Fail at runtime (or silently return wrong data) | Caught at compile time |
| **XSD types** | Many numeric types (e.g. `unsignedInt`) fall through as raw strings | Custom deserializer converts them to proper `number` values |
| **Introspection** | Use `client.describe()` manually | `$describe()`, `$services`, `$ports`, `$operations` at each level for debugging |
| **Brand checking** | No way to detect a soap client at runtime | `Symbol.for("tsoap.client")` for type guards |

## How It Works

### The `InferClient<T>` type

The magic is a conditional mapped type that transforms a static definition into callable methods:

```typescript
type InferClient<T extends ServiceDefinition> = {
  [S in keyof T]: {
    [P in keyof T[S]]: {
      [O in keyof T[S][P]]: T[S][P][O] extends { input: infer I; output: infer O }
        ? (input: I) => Promise<O>
        : never;
    };
  };
};
```

### The Proxy pattern

At runtime, `createSoapClient` wraps the `soap.Client` in a 3-level nested `Proxy`:

1. **Level 1** (service name) returns a proxy for ports
2. **Level 2** (port name) returns a proxy for operations
3. **Level 3** (operation name) returns an async function that calls `client[service][port][operationAsync](...)` and returns only the first element of the response tuple

**Design choices:**

- **Allowlist, not throw** — Unknown property accesses return `undefined` instead of throwing. TypeScript's `InferClient<T>` provides compile-time safety; the allowlist keeps the proxy compatible with loggers, test frameworks, bundlers, and devtools that introspect objects.
- **Full Proxy traps** — `has`, `ownKeys`, and `getOwnPropertyDescriptor` are implemented so `Object.keys(proxy)`, `"ServiceName" in proxy`, and spread work correctly.
- **Introspection helpers** — At each level: `$describe()` returns the WSDL structure, `$services` / `$ports` / `$operations` list available names. Use `Symbol.for("tsoap.client")` to detect a typed-soap client at runtime.

Zero overhead at the type level (types are erased at compile time) and minimal overhead at runtime (property access delegation).

## Examples

- [`examples/weather-api`](examples/weather-api) -- Simple single-operation service
- [`examples/order-api`](examples/order-api) -- Complex service with arrays, enums, optional fields, and multiple operations

## Support

- [Report an issue](https://github.com/Deodat-Lawson/tsoap/issues)
- [View source](https://github.com/Deodat-Lawson/tsoap)

## Contributing

```bash
git clone https://github.com/Deodat-Lawson/tsoap.git
cd tsoap
pnpm install
pnpm -r build

# Generate types from example WSDLs
cd examples/weather-api && pnpm generate
cd ../order-api && pnpm generate

# Type-check everything
pnpm -r typecheck
```

## License

MIT
