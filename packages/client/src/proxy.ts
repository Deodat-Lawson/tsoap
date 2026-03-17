import type { Client } from "soap";

const JS_INTERNALS = new Set([
  "then",
  "toJSON",
  "valueOf",
  "toString",
  "inspect",
  "constructor",
  "asymmetricMatch",
  "nodeType",
  "tagName",
  "$$typeof",
  "@@__IMMUTABLE_ITERABLE__@@",
  "@@__IMMUTABLE_RECORD__@@",
]);

function isInternalAccess(prop: string | symbol): boolean {
  return typeof prop === "symbol" || JS_INTERNALS.has(prop as string);
}

/**
 * Creates a 3-level nested Proxy over a soap Client so that
 * `proxy.ServiceName.PortName.OperationName(args)` delegates to
 * `client.ServiceName.PortName.OperationNameAsync(args)` and
 * returns only the result (first element of the response tuple).
 */
export function createClientProxy(client: Client): unknown {
  const serviceDescription = client.describe();

  return new Proxy(
    {},
    {
      get(_target, serviceName: string | symbol) {
        if (isInternalAccess(serviceName)) return undefined;

        if (!(serviceName in serviceDescription)) {
          const available = Object.keys(serviceDescription);
          throw new Error(
            `Service "${String(serviceName)}" not found. ` +
              `Available services: ${JSON.stringify(available)}`,
          );
        }

        return new Proxy(
          {},
          {
            get(_target, portName: string | symbol) {
              if (isInternalAccess(portName)) return undefined;

              const portDesc =
                serviceDescription[serviceName as string]?.[portName as string];
              if (!portDesc) {
                const available = Object.keys(
                  serviceDescription[serviceName as string] ?? {},
                );
                throw new Error(
                  `Port "${String(portName)}" not found on service "${String(serviceName)}". ` +
                    `Available ports: ${JSON.stringify(available)}`,
                );
              }

              return new Proxy(
                {},
                {
                  get(_target, operationName: string | symbol) {
                    if (isInternalAccess(operationName)) return undefined;

                    if (!(operationName in portDesc)) {
                      const available = Object.keys(portDesc);
                      throw new Error(
                        `Operation "${String(operationName)}" not found on ` +
                          `${String(serviceName)}.${String(portName)}. ` +
                          `Available operations: ${JSON.stringify(available)}`,
                      );
                    }

                    return async (input: unknown) => {
                      const serviceObj = (client as Record<string, unknown>)[
                        serviceName as string
                      ] as Record<string, unknown> | undefined;
                      const portObj = serviceObj?.[portName as string] as
                        | Record<string, unknown>
                        | undefined;
                      const method = portObj?.[
                        (operationName as string) + "Async"
                      ] as
                        | ((...args: unknown[]) => Promise<unknown[]>)
                        | undefined;

                      if (typeof method !== "function") {
                        throw new Error(
                          `Operation ${String(serviceName)}.${String(portName)}.${String(operationName)} ` +
                            `exists in WSDL but was not found on the SOAP client`,
                        );
                      }

                      const [result] = await method(input);
                      return result;
                    };
                  },
                },
              );
            },
          },
        );
      },
    },
  );
}
