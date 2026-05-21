import startEntry from "@tanstack/react-start/server-entry";

const CANONICAL_HOST = "paseo.sh";

type FetchArgs = Parameters<typeof startEntry.fetch>;

export default {
  async fetch(...args: FetchArgs): Promise<Response> {
    const [request] = args;
    const url = new URL(request.url);
    if (url.hostname !== CANONICAL_HOST || url.protocol !== "https:") {
      url.protocol = "https:";
      url.hostname = CANONICAL_HOST;
      return Response.redirect(url.toString(), 301);
    }
    return startEntry.fetch(...args);
  },
};
