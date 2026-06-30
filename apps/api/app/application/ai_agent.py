import json
import litellm
from typing import List, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.infrastructure.security.credential_manager import CredentialManager
from app.infrastructure.db.models import AIMemoryModel, ContextSnippetModel

class AIAgent:
    def __init__(self, session: AsyncSession, project_id: int | None = None):
        self.session = session
        self.project_id = project_id
        self.model = "gemini/gemini-2.5-flash"  # Default Gemini model via litellm

        self.tools = [
            {
                "type": "function",
                "function": {
                    "name": "mem_save",
                    "description": "Saves a long-term memory summary, decision, or architectural note.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "memory_type": {"type": "string", "description": "e.g., 'decision', 'summary', 'architecture'"},
                            "topic": {"type": "string", "description": "A short, stable key or topic name for this memory"},
                            "content": {"type": "string", "description": "The detailed content to save"}
                        },
                        "required": ["memory_type", "topic", "content"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "mem_search",
                    "description": "Searches past memories based on a keyword.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "query": {"type": "string", "description": "Keyword to search in memories"}
                        },
                        "required": ["query"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "context_search",
                    "description": "Searches codebase context snippets (like parsed dependencies).",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "query": {"type": "string", "description": "Keyword to search in context snippets"}
                        },
                        "required": ["query"]
                    }
                }
            }
        ]

    async def _handle_tool_call(self, tool_call: Any) -> str:
        """Executes a requested tool call and returns a string response."""
        name = tool_call.function.name
        args = json.loads(tool_call.function.arguments)

        if name == "mem_save":
            memory = AIMemoryModel(
                project_id=self.project_id,
                memory_type=args["memory_type"],
                topic=args["topic"],
                content=args["content"]
            )
            self.session.add(memory)
            await self.session.commit()
            return f"Memory '{args['topic']}' saved successfully."

        elif name == "mem_search":
            query = args["query"]
            stmt = select(AIMemoryModel).where(AIMemoryModel.content.icontains(query))
            if self.project_id:
                stmt = stmt.where(AIMemoryModel.project_id == self.project_id)
            result = await self.session.execute(stmt)
            memories = result.scalars().all()
            if not memories:
                return "No memories found."
            return json.dumps([{"topic": m.topic, "content": m.content, "type": m.memory_type} for m in memories])

        elif name == "context_search":
            query = args["query"]
            # Fallback to basic ILIKE search since sqlite-vec virtual table is not yet fully configured with triggers
            stmt = select(ContextSnippetModel).where(ContextSnippetModel.content.icontains(query))
            if self.project_id:
                stmt = stmt.where(ContextSnippetModel.project_id == self.project_id)
            result = await self.session.execute(stmt)
            snippets = result.scalars().all()
            if not snippets:
                return "No context found."
            return json.dumps([{"type": s.type, "content": s.content} for s in snippets])
            
        return "Unknown tool."

    def _get_provider(self, model: str) -> str:
        model_lower = model.lower()
        if "gemini" in model_lower:
            return "gemini"
        elif "claude" in model_lower or "anthropic" in model_lower:
            return "anthropic"
        elif "gpt" in model_lower or "openai" in model_lower:
            return "openai"
        elif "openrouter" in model_lower:
            return "openrouter"
        return "gemini"

    async def chat(self, messages: List[Dict[str, str]], model: str = "gemini/gemini-1.5-pro-latest") -> str:
        """
        Processes a chat conversation and allows the AI to call tools before returning a final response.
        """
        provider = self._get_provider(model)
        api_key = CredentialManager.get_api_key(provider)
        
        if not api_key and provider != "openrouter" and "ollama" not in model.lower():
            raise ValueError(f"API Key for {provider} not configured.")

        # Prepare LiteLLM call
        response = await litellm.acompletion(
            model=model,
            messages=messages,
            tools=self.tools,
            api_key=api_key
        )

        message = response.choices[0].message

        # If model wants to call tools
        if message.tool_calls:
            # Add the model's tool calls to the messages
            messages.append(message.model_dump())
            
            for tool_call in message.tool_calls:
                tool_response_str = await self._handle_tool_call(tool_call)
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "name": tool_call.function.name,
                    "content": tool_response_str
                })
            
            # Second call to get final answer
            second_response = await litellm.acompletion(
                model=model,
                messages=messages,
                api_key=api_key
            )
            return str(second_response.choices[0].message.content)

        return str(message.content)
