/*
 * Copyright 2021-Present The Serverless Workflow Specification Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { execFileSync } from "child_process";

const configFilename = ".oxlintrc.json";
const __dirname = dirname(fileURLToPath(import.meta.url));
const oxlintBin = process.platform === "win32" ? "oxlint.cmd" : "oxlint";
const oxlintPath = join(__dirname, "node_modules", ".bin", oxlintBin);

// Use local configuration if exists, otherwise fallback to linter's config
const localConfigPath = join(process.cwd(), configFilename);
const configPath = join(__dirname, configFilename);
const selectedConfig = existsSync(localConfigPath) ? localConfigPath : configPath;

const args = ["--config", selectedConfig, ...process.argv.slice(2)];

try {
  execFileSync(oxlintPath, args, {
    stdio: "inherit",
    cwd: process.cwd(),
  });
} catch (err) {
  const message = err instanceof Error && err.message ? err.message : err;
  console.error("[Linter] Error.\n", message);
  process.exit(1);
}
console.info("[Linter] Done.");
