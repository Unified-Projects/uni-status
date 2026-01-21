import { auth, toNextJsHandler } from "@uni-status/auth";

export const { GET, POST } = toNextJsHandler(auth);
