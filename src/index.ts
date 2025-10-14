import { Elysia } from "elysia";
import staticPlugin from "@elysiajs/static";

const app = new Elysia()
    .use(await staticPlugin({
        prefix: '/',
    }))
    .listen(3000);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
