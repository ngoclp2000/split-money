import "dotenv/config";
import { createApp } from "./http/app.js";
import { createStore } from "./store/index.js";

const port = Number(process.env.PORT ?? 4000);
const app = createApp(createStore());

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
