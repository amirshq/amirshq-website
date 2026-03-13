import { useState } from "react";

const phases = [
  {
    id: "data",
    label: "Data Strategy",
    icon: "🗄️",
    color: "#00D9FF",
    debt: "Context management — agents accumulate conversation history, tool outputs, retrieved docs, and intermediate reasoning. Too much = latency/cost. Too little = poor performance.",
    tools: [
      { name: "ChromaDB", role: "Local vector store for RAG document retrieval", type: "Vector DB" },
      { name: "Pinecone", role: "Cloud vector DB for semantic search at scale", type: "Vector DB" },
      { name: "pgvector", role: "PostgreSQL extension for unified relational + vector storage", type: "Vector DB" },
      { name: "SQLite", role: "Lightweight episodic memory & conversation history store", type: "Relational" },
      { name: "PostgreSQL", role: "Production-grade structured data & agent state", type: "Relational" },
      { name: "Neo4j", role: "Knowledge graph memory for relationship traversal", type: "Graph DB" },
      { name: "LangChain Memory", role: "Conversation buffer, summary, and window memory abstractions", type: "Framework" },
      { name: "LangMem", role: "Long-term semantic memory management for agents", type: "Framework" },
    ],
  },
  {
    id: "ai-core",
    label: "AI Core Development",
    icon: "🧠",
    color: "#A78BFA",
    debt: "Prompt complexity — logic encoded in prompts becomes fragile, large, and hard to maintain. A small wording change can break behavior. Not strongly typed or validated like code.",
    tools: [
      { name: "LangGraph", role: "Stateful, graph-based agent orchestration with control flow", type: "Orchestration" },
      { name: "LangChain", role: "Chain-based LLM orchestration and tool integration", type: "Orchestration" },
      { name: "CrewAI", role: "Multi-agent role-based collaboration framework", type: "Orchestration" },
      { name: "AutoGen", role: "Microsoft's conversational multi-agent framework", type: "Orchestration" },
      { name: "OpenAI API", role: "GPT models as the LLM reasoning core", type: "LLM Provider" },
      { name: "Azure OpenAI", role: "Enterprise-grade GPT deployment on Azure", type: "LLM Provider" },
      { name: "Anthropic API", role: "Claude models for reasoning and tool use", type: "LLM Provider" },
      { name: "Prompt flow", role: "Azure tool for prompt versioning and flow design", type: "Prompt Mgmt" },
    ],
  },
  {
    id: "testing",
    label: "Testing & Evaluation",
    icon: "🧪",
    color: "#34D399",
    debt: "Evaluation gap — LLM behavior is probabilistic, not deterministic. Teams rely on manual testing or anecdotal evidence instead of systematic pipelines, leading to unpredictable failures.",
    tools: [
      { name: "LangSmith", role: "LangChain's tracing, testing, and evaluation platform", type: "Eval Platform" },
      { name: "RAGAS", role: "RAG-specific evaluation framework (faithfulness, relevance)", type: "Eval Framework" },
      { name: "DeepEval", role: "Open-source LLM evaluation with metrics like hallucination rate", type: "Eval Framework" },
      { name: "PromptFoo", role: "CLI tool for prompt regression testing and comparison", type: "Prompt Testing" },
      { name: "Pytest", role: "Unit and integration tests for deterministic agent components", type: "Code Testing" },
      { name: "Evals (OpenAI)", role: "OpenAI's framework for benchmarking model outputs", type: "Eval Framework" },
      { name: "TruLens", role: "Feedback-based LLM app evaluation and tracing", type: "Eval Platform" },
    ],
  },
  {
    id: "error",
    label: "Error Handling & Fallbacks",
    icon: "🛡️",
    color: "#FB923C",
    debt: "System reliability — agents have many moving parts (model, prompt, tools, retrieval, orchestration). Failures can occur at any point. Without safeguards, agents produce incorrect or misleading outputs.",
    tools: [
      { name: "Tenacity", role: "Python retry library with exponential backoff for API calls", type: "Retry Logic" },
      { name: "LangGraph error nodes", role: "Graph-level error routing and fallback state handling", type: "Orchestration" },
      { name: "Guardrails AI", role: "Output validation and structured correction for LLM responses", type: "Validation" },
      { name: "NeMo Guardrails", role: "NVIDIA's framework for safe, on-topic LLM behavior", type: "Safety" },
      { name: "Pydantic", role: "Schema validation for structured agent outputs and tool inputs", type: "Validation" },
      { name: "Circuit Breaker (custom)", role: "Prevent cascading failures when downstream tools fail", type: "Resilience" },
    ],
  },
  {
    id: "security",
    label: "Security & Privacy",
    icon: "🔒",
    color: "#F87171",
    debt: "Tool integration risk — each external tool (API, DB, search) introduces hidden coupling. If a tool interface or output format changes, the agent silently produces incorrect results.",
    tools: [
      { name: "Azure Key Vault", role: "Secrets management for API keys and credentials", type: "Secrets" },
      { name: "AWS Secrets Manager", role: "Secure storage and rotation of credentials", type: "Secrets" },
      { name: "python-dotenv", role: "Local env variable management for dev environments", type: "Config" },
      { name: "Presidio (Microsoft)", role: "PII detection and anonymization in text data", type: "Privacy" },
      { name: "LangChain callbacks", role: "Intercept and audit all LLM inputs/outputs for compliance", type: "Audit" },
      { name: "OAuth2 / JWT", role: "Secure API authentication for agent tool calls", type: "Auth" },
    ],
  },
  {
    id: "deployment",
    label: "Deployment",
    icon: "🚀",
    color: "#60A5FA",
    debt: "Orchestration complexity at scale — the model, prompt, tools, retrieval, and orchestration logic all need to be versioned, containerized, and deployed cohesively.",
    tools: [
      { name: "Docker", role: "Containerize agents and all dependencies", type: "Container" },
      { name: "Azure Functions", role: "Serverless deployment for event-driven agent triggers", type: "Serverless" },
      { name: "Azure Container Apps", role: "Managed container hosting with auto-scaling", type: "Cloud" },
      { name: "FastAPI", role: "Serve agents as REST APIs with async support", type: "API Server" },
      { name: "LangServe", role: "Deploy LangChain agents as production REST endpoints", type: "Framework" },
      { name: "GitHub Actions", role: "CI/CD pipelines for agent code and prompt versioning", type: "CI/CD" },
      { name: "Terraform / Bicep", role: "Infrastructure-as-code for Azure/AWS provisioning", type: "IaC" },
    ],
  },
  {
    id: "monitoring",
    label: "Monitoring & Logging",
    icon: "📊",
    color: "#FBBF24",
    debt: "Observability gap — decisions happen inside the LLM black box. Without logging and tracing infrastructure, you can't understand why the system produced a particular output.",
    tools: [
      { name: "LangSmith", role: "Full trace visibility: inputs, outputs, token usage, latency", type: "LLM Tracing" },
      { name: "Helicone", role: "LLM proxy with request logging and cost tracking", type: "LLM Proxy" },
      { name: "Arize Phoenix", role: "Open-source LLM observability and tracing", type: "Observability" },
      { name: "Azure Monitor", role: "Cloud-native metrics, logs, and alerts for Azure deployments", type: "Cloud Monitor" },
      { name: "Datadog", role: "Full-stack monitoring with LLM observability integrations", type: "APM" },
      { name: "OpenTelemetry", role: "Vendor-neutral tracing and metrics instrumentation", type: "Standards" },
      { name: "Loguru / structlog", role: "Python structured logging for agent decision steps", type: "Logging" },
    ],
  },
  {
    id: "fallback",
    label: "Fallback Loop & Continuous Improvement",
    icon: "🔄",
    color: "#E879F9",
    debt: "No test coverage for probabilistic systems — without feedback loops and systematic evals, improvements are guesswork. Systems that appear to work fail predictably under new conditions.",
    tools: [
      { name: "LangSmith Datasets", role: "Capture production failures as eval datasets for regression testing", type: "Eval" },
      { name: "RLHF pipelines", role: "Human feedback loops to improve model behavior over time", type: "Fine-tuning" },
      { name: "MLflow", role: "Track experiments, prompt versions, and model performance metrics", type: "Experiment Tracking" },
      { name: "Weights & Biases", role: "Experiment tracking and model performance dashboards", type: "Experiment Tracking" },
      { name: "A/B prompt testing", role: "PromptFoo or custom harnesses to compare prompt versions", type: "Prompt Mgmt" },
      { name: "Databricks", role: "Lakehouse for storing feedback data and retraining pipelines", type: "Data Platform" },
    ],
  },
  {
    id: "maintenance",
    label: "Maintenance",
    icon: "🔧",
    color: "#6EE7B7",
    debt: "Scalability ceiling — without clean architecture, evaluation, observability, and maintainability practices, the entire system becomes difficult or impossible to scale and maintain.",
    tools: [
      { name: "Git + DVC", role: "Version control for code AND data/prompt artifacts", type: "Versioning" },
      { name: "Prompt registries", role: "LangSmith Hub or custom stores for versioned prompt management", type: "Prompt Mgmt" },
      { name: "Dependabot", role: "Automated dependency updates to avoid tool interface breakage", type: "Dependencies" },
      { name: "Makefile / Task", role: "Standardize dev commands: run, test, deploy, lint", type: "Dev Ops" },
      { name: "Architecture Decision Records", role: "Document why key design choices were made — critical for agents", type: "Documentation" },
      { name: "LangGraph Studio", role: "Visual debugging and state inspection for graph-based agents", type: "Debugging" },
      { name: "Pre-commit hooks", role: "Enforce prompt format, code quality, and schema validation on commit", type: "Code Quality" },
    ],
  },
];

const typeColors: Record<string, string> = {
  "Vector DB": "#00D9FF",
  Relational: "#60A5FA",
  "Graph DB": "#A78BFA",
  Framework: "#34D399",
  Orchestration: "#A78BFA",
  "LLM Provider": "#F472B6",
  "Prompt Mgmt": "#FBBF24",
  "Eval Platform": "#34D399",
  "Eval Framework": "#6EE7B7",
  "Prompt Testing": "#FBBF24",
  "Code Testing": "#60A5FA",
  "Retry Logic": "#FB923C",
  Validation: "#F87171",
  Safety: "#F43F5E",
  Resilience: "#FB923C",
  Secrets: "#F87171",
  Privacy: "#E879F9",
  Audit: "#FBBF24",
  Auth: "#60A5FA",
  Config: "#6EE7B7",
  Container: "#60A5FA",
  Serverless: "#A78BFA",
  Cloud: "#00D9FF",
  "API Server": "#34D399",
  "CI/CD": "#FBBF24",
  IaC: "#FB923C",
  "LLM Tracing": "#FBBF24",
  "LLM Proxy": "#FB923C",
  Observability: "#34D399",
  "Cloud Monitor": "#60A5FA",
  APM: "#F472B6",
  Standards: "#6EE7B7",
  Logging: "#A78BFA",
  Eval: "#34D399",
  "Fine-tuning": "#E879F9",
  "Experiment Tracking": "#FBBF24",
  "Data Platform": "#00D9FF",
  Versioning: "#60A5FA",
  Dependencies: "#FB923C",
  "Dev Ops": "#6EE7B7",
  Documentation: "#A78BFA",
  Debugging: "#F472B6",
  "Code Quality": "#34D399",
};

export default function AgentTechnicalDebtMap() {
  const [active, setActive] = useState(phases[0].id);
  const phase = phases.find((p) => p.id === active)!;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0A0A0F",
        color: "#E2E8F0",
        fontFamily: "'IBM Plex Mono', 'Fira Code', monospace",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "32px 40px 20px",
          borderBottom: "1px solid #1E1E2E",
        }}
      >
        <div
          style={{
            fontSize: "11px",
            letterSpacing: "0.2em",
            color: "#4B5563",
            marginBottom: "6px",
            textTransform: "uppercase",
          }}
        >
          Technical Debt Reference — AI Agents
        </div>
        <h1
          style={{
            fontSize: "22px",
            fontWeight: 700,
            margin: 0,
            color: "#F8FAFC",
            letterSpacing: "-0.02em",
          }}
        >
          Hidden Debt → Tools Stack
        </h1>
        <p
          style={{
            fontSize: "12px",
            color: "#6B7280",
            marginTop: "6px",
            margin: "6px 0 0",
          }}
        >
          Each phase maps the technical debt risk to the tools that mitigate it
        </p>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Sidebar */}
        <div
          style={{
            width: "220px",
            flexShrink: 0,
            borderRight: "1px solid #1E1E2E",
            padding: "16px 0",
            overflowY: "auto",
          }}
        >
          {phases.map((p) => (
            <button
              key={p.id}
              onClick={() => setActive(p.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                width: "100%",
                padding: "10px 20px",
                background: active === p.id ? "#13131F" : "transparent",
                border: "none",
                borderLeft:
                  active === p.id ? `3px solid ${p.color}` : "3px solid transparent",
                color: active === p.id ? "#F8FAFC" : "#6B7280",
                cursor: "pointer",
                textAlign: "left",
                fontSize: "12px",
                fontFamily: "inherit",
                transition: "all 0.15s",
              }}
            >
              <span style={{ fontSize: "14px" }}>{p.icon}</span>
              <span style={{ lineHeight: 1.3 }}>{p.label}</span>
            </button>
          ))}
        </div>

        {/* Main content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "32px 40px" }}>
          {/* Phase header */}
          <div style={{ marginBottom: "28px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                marginBottom: "12px",
              }}
            >
              <span style={{ fontSize: "28px" }}>{phase.icon}</span>
              <h2
                style={{
                  margin: 0,
                  fontSize: "20px",
                  fontWeight: 700,
                  color: phase.color,
                }}
              >
                {phase.label}
              </h2>
            </div>

            {/* Debt callout */}
            <div
              style={{
                background: "#13131F",
                border: `1px solid ${phase.color}22`,
                borderLeft: `3px solid ${phase.color}`,
                borderRadius: "6px",
                padding: "14px 16px",
              }}
            >
              <div
                style={{
                  fontSize: "10px",
                  letterSpacing: "0.15em",
                  color: phase.color,
                  marginBottom: "6px",
                  textTransform: "uppercase",
                }}
              >
                ⚠ Hidden Debt Risk
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: "13px",
                  color: "#CBD5E1",
                  lineHeight: 1.6,
                }}
              >
                {phase.debt}
              </p>
            </div>
          </div>

          {/* Tools grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: "12px",
            }}
          >
            {phase.tools.map((tool) => (
              <div
                key={tool.name}
                style={{
                  background: "#0F0F1A",
                  border: "1px solid #1E1E2E",
                  borderRadius: "8px",
                  padding: "16px",
                  transition: "border-color 0.2s",
                  cursor: "default",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.borderColor =
                    phase.color + "55";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.borderColor = "#1E1E2E";
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    marginBottom: "8px",
                  }}
                >
                  <div
                    style={{
                      fontSize: "14px",
                      fontWeight: 700,
                      color: "#F1F5F9",
                    }}
                  >
                    {tool.name}
                  </div>
                  <span
                    style={{
                      fontSize: "9px",
                      padding: "2px 8px",
                      borderRadius: "99px",
                      background: (typeColors[tool.type] || "#6B7280") + "22",
                      color: typeColors[tool.type] || "#6B7280",
                      border: `1px solid ${
                        typeColors[tool.type] || "#6B7280"
                      }44`,
                      whiteSpace: "nowrap",
                      marginLeft: "8px",
                      fontWeight: 600,
                      letterSpacing: "0.05em",
                    }}
                  >
                    {tool.type}
                  </span>
                </div>
                <p
                  style={{
                    margin: 0,
                    fontSize: "12px",
                    color: "#94A3B8",
                    lineHeight: 1.5,
                  }}
                >
                  {tool.role}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          padding: "12px 40px",
          borderTop: "1px solid #1E1E2E",
          fontSize: "11px",
          color: "#374151",
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>Based on: Hidden Technical Debt Behind AI Agents</span>
        <span>
          {phases.length} phases ·{" "}
          {phases.reduce((a, p) => a + p.tools.length, 0)} tools mapped
        </span>
      </div>
    </div>
  );
}

