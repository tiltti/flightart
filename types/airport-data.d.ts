declare module "airport-data" {
  interface AirportDataRecord {
    id: number;
    name: string;
    city: string;
    country: string;
    iata: string | null;
    icao: string | null;
    latitude: number;
    longitude: number;
    altitude: number;
    tz: string;
    type: string;
    source: string;
  }
  const airports: AirportDataRecord[];
  export default airports;
}
