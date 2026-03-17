/**
 * Compile-time-only test. Run `tsc --noEmit` to verify.
 * This file should never be executed at runtime.
 */
import { createWeatherServiceClient } from "../generated/weather.js";

async function _typeTests() {
  const client = await createWeatherServiceClient("http://example.com?wsdl");

  // Valid call -- should compile
  const result = await client.WeatherService.WeatherPort.GetWeather({
    city: "NYC",
  });

  // Result fields should be correctly typed
  const _temp: number = result.temperature;
  const _desc: string = result.description;

  void _temp;
  void _desc;

  // @ts-expect-error -- wrong input field
  await client.WeatherService.WeatherPort.GetWeather({ wrong: 123 });

  // @ts-expect-error -- accessing nonexistent output field
  result.nonexistent;
}

void _typeTests;
