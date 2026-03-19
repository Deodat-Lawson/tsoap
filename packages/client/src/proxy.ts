import type { Client } from "soap";

export const TSOAP_BRAND = Symbol.for("tsoap.client");

function createOperationProxy(
  client: Client,
  serviceName: string,
  portName: string,
  portDesc: Record<string, unknown>,
): object {
  const opKeys = Object.keys(portDesc);

  const resolve = (prop: string | symbol): unknown => {
    if (typeof prop === "symbol") return undefined;
    if (prop === "$describe") return () => structuredClone(portDesc);
    if (prop === "$operations") return opKeys;
    if (!(prop in portDesc)) return undefined;

    return async (input: unknown) => {
      const serviceObj = (client as Record<string, unknown>)[serviceName] as
        | Record<string, unknown>
        | undefined;
      const portObj = serviceObj?.[portName] as
        | Record<string, unknown>
        | undefined;
      const method = portObj?.[prop + "Async"] as
        | ((...args: unknown[]) => Promise<unknown[]>)
        | undefined;

      if (typeof method !== "function") {
        throw new Error(
          `Operation ${serviceName}.${portName}.${String(prop)} ` +
            `exists in WSDL but was not found on the SOAP client`,
        );
      }

      const [result] = await method(input);
      return result;
    };
  };

  return new Proxy(
    {},
    {
      get: (_t, prop) => resolve(prop),
      has: (_t, prop) => {
        if (typeof prop === "symbol") return false;
        return prop in portDesc;
      },
      ownKeys: () => opKeys,
      getOwnPropertyDescriptor: (_t, prop) => {
        if (typeof prop === "symbol") return undefined;
        if (!(prop in portDesc)) return undefined;
        return { configurable: true, enumerable: true, value: resolve(prop) };
      },
    },
  );
}

function createPortProxy(
  client: Client,
  serviceName: string,
  serviceDesc: Record<string, Record<string, unknown>>,
): object {
  const portKeys = Object.keys(serviceDesc);

  const resolve = (prop: string | symbol): unknown => {
    if (typeof prop === "symbol") return undefined;
    if (prop === "$describe") return () => structuredClone(serviceDesc);
    if (prop === "$ports") return portKeys;
    if (!(prop in serviceDesc)) return undefined;
    return createOperationProxy(client, serviceName, prop, serviceDesc[prop]);
  };

  return new Proxy(
    {},
    {
      get: (_t, prop) => resolve(prop),
      has: (_t, prop) => {
        if (typeof prop === "symbol") return false;
        return prop in serviceDesc;
      },
      ownKeys: () => portKeys,
      getOwnPropertyDescriptor: (_t, prop) => {
        if (typeof prop === "symbol") return undefined;
        if (!(prop in serviceDesc)) return undefined;
        return { configurable: true, enumerable: true, value: resolve(prop) };
      },
    },
  );
}

/**
 * Creates a 3-level nested Proxy over a soap Client so that
 * `proxy.ServiceName.PortName.OperationName(args)` delegates to
 * `client.ServiceName.PortName.OperationNameAsync(args)` and
 * returns only the result (first element of the response tuple).
 *
 * Unknown property accesses silently return `undefined` — TypeScript's
 * `InferClient<T>` provides compile-time safety, and the allowlist
 * pattern ensures compatibility with runtime introspection from
 * loggers, test frameworks, bundlers, devtools, etc.
 *
 * Introspection helpers (`$describe()`, `$services`, `$ports`,
 * `$operations`) are available at each proxy level for debugging.
 * Use `Symbol.for("tsoap.client")` for brand checking.
 */
export function createClientProxy(client: Client): unknown {
  const desc = client.describe();
  const serviceKeys = Object.keys(desc);

  const resolve = (prop: string | symbol): unknown => {
    if (typeof prop === "symbol") {
      if (prop === TSOAP_BRAND) return true;
      return undefined;
    }
    if (prop === "$describe") return () => structuredClone(desc);
    if (prop === "$services") return serviceKeys;
    if (!(prop in desc)) return undefined;
    return createPortProxy(client, prop, desc[prop]);
  };

  return new Proxy(
    {},
    {
      get: (_t, prop) => resolve(prop),
      has: (_t, prop) => {
        if (typeof prop === "symbol") return prop === TSOAP_BRAND;
        return prop in desc;
      },
      ownKeys: () => serviceKeys,
      getOwnPropertyDescriptor: (_t, prop) => {
        if (typeof prop === "symbol") return undefined;
        if (!(prop in desc)) return undefined;
        return { configurable: true, enumerable: true, value: resolve(prop) };
      },
    },
  );
}
