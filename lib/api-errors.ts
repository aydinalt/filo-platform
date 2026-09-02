export function apiErrorResponse(error: unknown, fallback: string, status = 500): Response {
  if (error instanceof Response) return error;
  const incidentId = `ERR-${crypto.randomUUID()}`;
  console.error(`[${incidentId}] ${fallback}`, error);
  return Response.json({ error: fallback, incidentId }, { status });
}
