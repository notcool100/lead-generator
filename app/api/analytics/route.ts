import { apiHandler, json } from "@/lib/api";
import { getAnalytics } from "@/services/analytics";

export const GET = apiHandler({}, async () => json(await getAnalytics()));
