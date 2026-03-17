import * as soap from "soap";
import type { ServiceDefinition, InferClient, SoapClientOptions } from "./types.js";
import { typedSoapDeserializer } from "./deserializer.js";
import { createClientProxy } from "./proxy.js";

export type { ServiceDefinition, OperationDefinition, InferClient, SoapClientOptions } from "./types.js";

/**
 * Creates a type-safe SOAP client from a WSDL URL or file path.
 *
 * The generic parameter `T` should be a generated `ServiceDefinition`
 * produced by `tsoap-cli`. The returned client has fully typed methods
 * matching the WSDL's services, ports, and operations.
 *
 * @example
 * ```ts
 * import { createSoapClient } from 'typed-soap';
 * import type { MyServiceDef } from './generated/my-service.js';
 *
 * const client = await createSoapClient<MyServiceDef>('http://example.com?wsdl');
 * const result = await client.MyService.MyPort.MyOp({ arg: 'value' });
 * ```
 */
export async function createSoapClient<T extends ServiceDefinition>(
  wsdlUrl: string,
  options?: SoapClientOptions,
): Promise<InferClient<T>> {
  if (!wsdlUrl) {
    throw new Error("createSoapClient: wsdlUrl is required");
  }

  const { endpoint, customDeserializer: userDeserializer, ...soapOptions } =
    options ?? {};

  const mergedOptions: soap.IOptions = {
    ...soapOptions,
    customDeserializer: {
      ...typedSoapDeserializer,
      ...userDeserializer,
    },
  };

  let client: soap.Client;
  try {
    client = await soap.createClientAsync(wsdlUrl, mergedOptions);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to create SOAP client from "${wsdlUrl}": ${message}`,
    );
  }

  if (endpoint) {
    client.setEndpoint(endpoint);
  }

  return createClientProxy(client) as InferClient<T>;
}
