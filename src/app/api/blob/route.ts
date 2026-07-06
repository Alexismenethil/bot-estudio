import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

// Client-upload token route: the browser uploads the PDF binary directly to
// Vercel Blob (serverless functions aren't a good fit for ~50MB bodies); the
// client then calls POST /api/documents separately with the resulting blobUrl.
export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody;

  const jsonResponse = await handleUpload({
    body,
    request,
    onBeforeGenerateToken: async () => ({
      allowedContentTypes: ["application/pdf"],
      addRandomSuffix: true,
    }),
  });

  return NextResponse.json(jsonResponse);
}
