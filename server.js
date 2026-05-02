const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

loadEnvFile();

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const PUBLIC_DIR = __dirname;

const MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8"
};

const planSchema = {
    name: "focusflow_daily_plan",
    strict: true,
    schema: {
        type: "object",
        additionalProperties: false,
        properties: {
            title: { type: "string" },
            overallStrategy: { type: "string" },
            tasks: {
                type: "array",
                minItems: 1,
                items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                        title: { type: "string" },
                        description: { type: "string" },
                        pomodoros: { type: "integer", minimum: 1, maximum: 12 },
                        complexity: {
                            type: "string",
                            enum: ["Easy", "Normal", "Hard", "Lengthy"]
                        },
                        orderReason: { type: "string" },
                        pomodoroReason: { type: "string" }
                    },
                    required: [
                        "title",
                        "description",
                        "pomodoros",
                        "complexity",
                        "orderReason",
                        "pomodoroReason"
                    ]
                }
            }
        },
        required: ["title", "overallStrategy", "tasks"]
    }
};

function createServer() {
    return http.createServer(async (request, response) => {
        const host = request.headers.host || `${HOST}:${PORT}`;
        const requestUrl = new URL(request.url, `http://${host}`);

        if (request.method === "POST" && requestUrl.pathname === "/api/plan-day") {
            await handlePlanRequest(request, response);
            return;
        }

        if (request.method === "GET") {
            serveStaticFile(requestUrl.pathname, response);
            return;
        }

        sendJson(response, 405, { error: "Method not allowed." });
    });
}

if (require.main === module) {
    const server = createServer();

    server.listen(PORT, HOST, () => {
        console.log(`FocusFlow server running at http://${HOST}:${PORT}`);
    });
}

async function handlePlanRequest(request, response) {
    if (!GEMINI_API_KEY) {
        sendJson(response, 500, {
            error: "Missing GEMINI_API_KEY. Add it to your .env file before generating a plan."
        });
        return;
    }

    try {
        const body = await readJsonBody(request);
        const objective = typeof body.objective === "string" ? body.objective.trim() : "";

        if (!objective) {
            sendJson(response, 400, { error: "Objective is required." });
            return;
        }

        const plan = await generatePomodoroPlan(objective);
        validatePlanShape(plan);

        sendJson(response, 200, { plan });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        sendJson(response, statusCode, {
            error: error.publicMessage || "Unable to generate a plan right now. Please try again."
        });
    }
}

async function generatePomodoroPlan(objective) {
    const apiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
        {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": GEMINI_API_KEY
        },
        body: JSON.stringify({
            contents: [
                {
                    parts: [
                        {
                            text: [
                                "You are an expert productivity planner.",
                                "Break the user's day objective into actionable Pomodoro tasks.",
                                "Write in short bullet-style phrases, not detailed paragraphs.",
                                "Keep every task title under 8 words.",
                                "Keep every task description under 12 words.",
                                "Assign a realistic pomodoro count to every task.",
                                "Assign one complexity label per task using exactly: Easy, Normal, Hard, Lengthy.",
                                "Put tasks in a practical execution order.",
                                "Keep orderReason under 10 words.",
                                "Keep pomodoroReason under 10 words.",
                                "Use crisp, direct wording with no filler.",
                                "Keep the plan realistic for a single day.",
                                `Today's objective: ${objective}`
                            ].join(" ")
                        }
                    ]
                }
            ],
            generationConfig: {
                responseMimeType: "application/json",
                responseJsonSchema: planSchema.schema
            }
        })
        }
    );

    const payload = await apiResponse.json();

    if (!apiResponse.ok) {
        const apiMessage =
            payload?.error?.message ||
            "The Gemini request failed. Check your API key and model configuration.";

        const error = new Error(apiMessage);
        error.statusCode = apiResponse.status;
        error.publicMessage = apiMessage;
        throw error;
    }

    const parsedText = extractStructuredText(payload);

    if (!parsedText) {
        const error = new Error("The AI response did not contain structured task data.");
        error.publicMessage = "The AI response came back in an unexpected format. Please try again.";
        throw error;
    }

    try {
        return JSON.parse(parsedText);
    } catch {
        const error = new Error("Invalid JSON received from AI.");
        error.publicMessage = "The AI response could not be read as a task plan. Please try again.";
        throw error;
    }
}

function extractStructuredText(payload) {
    const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];

    for (const candidate of candidates) {
        const parts = candidate?.content?.parts;

        if (!Array.isArray(parts)) {
            continue;
        }

        for (const part of parts) {
            if (typeof part.text === "string" && part.text.trim()) {
                return part.text;
            }
        }
    }

    return "";
}

function validatePlanShape(plan) {
    if (!plan || typeof plan !== "object") {
        throwPlanValidationError();
    }

    if (typeof plan.title !== "string" || typeof plan.overallStrategy !== "string") {
        throwPlanValidationError();
    }

    if (!Array.isArray(plan.tasks) || plan.tasks.length === 0) {
        throwPlanValidationError();
    }

    for (const task of plan.tasks) {
        const complexityOk = ["Easy", "Normal", "Hard", "Lengthy"].includes(task.complexity);
        const pomodoroOk = Number.isInteger(task.pomodoros) && task.pomodoros > 0;

        if (
            !task ||
            typeof task.title !== "string" ||
            typeof task.description !== "string" ||
            !pomodoroOk ||
            !complexityOk ||
            typeof task.orderReason !== "string" ||
            typeof task.pomodoroReason !== "string"
        ) {
            throwPlanValidationError();
        }
    }
}

function throwPlanValidationError() {
    const error = new Error("Plan schema validation failed.");
    error.publicMessage = "The AI returned an incomplete plan. Please try again.";
    throw error;
}

function serveStaticFile(requestPath, response) {
    const safePath = requestPath === "/" ? "/index.html" : requestPath;
    const filePath = path.join(PUBLIC_DIR, path.normalize(safePath));

    if (!filePath.startsWith(PUBLIC_DIR)) {
        sendJson(response, 403, { error: "Forbidden." });
        return;
    }

    fs.readFile(filePath, (error, fileBuffer) => {
        if (error) {
            sendJson(response, 404, { error: "Not found." });
            return;
        }

        const extension = path.extname(filePath);
        response.writeHead(200, {
            "Content-Type": MIME_TYPES[extension] || "application/octet-stream"
        });
        response.end(fileBuffer);
    });
}

function readJsonBody(request) {
    return new Promise((resolve, reject) => {
        let rawBody = "";

        request.on("data", (chunk) => {
            rawBody += chunk;

            if (rawBody.length > 1e6) {
                reject(Object.assign(new Error("Request too large."), {
                    statusCode: 413,
                    publicMessage: "The request is too large."
                }));
                request.destroy();
            }
        });

        request.on("end", () => {
            try {
                resolve(rawBody ? JSON.parse(rawBody) : {});
            } catch {
                reject(Object.assign(new Error("Invalid JSON body."), {
                    statusCode: 400,
                    publicMessage: "The request body must be valid JSON."
                }));
            }
        });

        request.on("error", () => {
            reject(Object.assign(new Error("Unable to read request body."), {
                statusCode: 400,
                publicMessage: "Unable to read the request."
            }));
        });
    });
}

function sendJson(response, statusCode, payload) {
    response.writeHead(statusCode, {
        "Content-Type": "application/json; charset=utf-8"
    });
    response.end(JSON.stringify(payload));
}

function loadEnvFile() {
    const envPath = path.join(__dirname, ".env");

    if (!fs.existsSync(envPath)) {
        return;
    }

    const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/u);

    for (const line of lines) {
        const trimmed = line.trim();

        if (!trimmed || trimmed.startsWith("#")) {
            continue;
        }

        const separatorIndex = trimmed.indexOf("=");

        if (separatorIndex === -1) {
            continue;
        }

        const key = trimmed.slice(0, separatorIndex).trim();
        let value = trimmed.slice(separatorIndex + 1).trim();

        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }

        if (!(key in process.env)) {
            process.env[key] = value;
        }
    }
}

module.exports = {
    createServer,
    extractStructuredText,
    generatePomodoroPlan,
    validatePlanShape
};
