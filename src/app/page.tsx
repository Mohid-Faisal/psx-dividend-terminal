import { fetchPortfolioFromSupabase } from "@/lib/db-service";
import PortfolioTerminalClient from "@/components/PortfolioTerminalClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HomePage() {
  const initialState = await fetchPortfolioFromSupabase();
  return <PortfolioTerminalClient initialState={initialState} />;
}
