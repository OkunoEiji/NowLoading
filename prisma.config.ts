import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  // Prisma の schema ファイルの場所
  schema: "prisma/schema.prisma",
  // ここに DB 接続URL を書く（.env の DATABASE_URL を読む）
  datasource: {
    url: env("DATABASE_URL"),
  },
});