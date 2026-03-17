import { createWeatherServiceClient } from "../generated/weather.js";

async function main() {
  const client = await createWeatherServiceClient(
    "http://localhost:8080/weather?wsdl",
  );

  const result = await client.WeatherService.WeatherPort.GetWeather({
    city: "NYC",
  });

  console.log(`Temperature: ${result.temperature}`);
  console.log(`Description: ${result.description}`);
}

main().catch(console.error);
