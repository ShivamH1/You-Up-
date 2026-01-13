import { treaty } from "@elysiajs/eden";
import type { app } from "../app/api/[[...slugs]]/route";

// .api to enter /api prefix
export const api = treaty<typeof app>(process.env.NEXT_PUBLIC_API_URL as string).api;