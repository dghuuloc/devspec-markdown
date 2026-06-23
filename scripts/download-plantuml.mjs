import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import http from "node:http";

const outputDir = path.resolve("packages/core/vendor");
const outputFile = path.join(outputDir, "plantuml.jar");

// GitHub redirects this URL to the latest PlantUML jar release.
const url = "https://github.com/plantuml/plantuml/releases/latest/download/plantuml.jar";

fs.mkdirSync(outputDir, { recursive: true });

if (fs.existsSync(outputFile)) {
    console.log(`[PlantUML] Already exists: ${outputFile}`);
    process.exit(0);
}

console.log("[PlantUML] Downloading plantuml.jar...");
console.log(`[PlantUML] Source: ${url}`);

download(url, outputFile, 0)
    .then(() => {
        const size = fs.statSync(outputFile).size;

        if (size < 1024 * 1024) {
            fs.rmSync(outputFile, { force: true });
            throw new Error("Downloaded file is too small. PlantUML jar download may have failed.");
        }

        console.log(`[PlantUML] Downloaded: ${outputFile}`);
    })
    .catch((error) => {
        fs.rmSync(outputFile, { force: true });
        console.error(`[PlantUML] Download failed: ${error.message}`);
        process.exit(1);
    });

function download(sourceUrl, destinationFile, redirectCount) {
    return new Promise((resolve, reject) => {
        if (redirectCount > 5) {
            reject(new Error("Too many redirects"));
            return;
        }

        const client = sourceUrl.startsWith("https:") ? https : http;

        const request = client.get(sourceUrl, (response) => {
            const statusCode = response.statusCode ?? 0;

            if ([301, 302, 303, 307, 308].includes(statusCode)) {
                const location = response.headers.location;

                if (!location) {
                    reject(new Error(`Redirect without location. HTTP ${statusCode}`));
                    return;
                }

                const nextUrl = new URL(location, sourceUrl).toString();
                response.resume();

                download(nextUrl, destinationFile, redirectCount + 1)
                    .then(resolve)
                    .catch(reject);

                return;
            }

            if (statusCode !== 200) {
                response.resume();
                reject(new Error(`HTTP ${statusCode}`));
                return;
            }

            const file = fs.createWriteStream(destinationFile);

            response.pipe(file);

            file.on("finish", () => {
                file.close();
                resolve();
            });

            file.on("error", reject);
        });

        request.on("error", reject);
    });
}