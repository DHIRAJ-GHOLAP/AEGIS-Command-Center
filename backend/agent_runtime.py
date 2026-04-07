import os
import subprocess
import json
import asyncio
from typing import List, Dict, Any, Callable
from agent_brains import BrainRouter

WORKSPACE_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

class AgentTools:
    @staticmethod
    def list_files(path: str = ".") -> str:
        full_path = os.path.normpath(os.path.join(WORKSPACE_ROOT, path))
        if not full_path.startswith(WORKSPACE_ROOT):
            return "Error: Path outside workspace."
        try:
            files = os.listdir(full_path)
            return json.dumps(files)
        except Exception as e:
            return f"Error: {str(e)}"

    @staticmethod
    def read_file(path: str) -> str:
        full_path = os.path.normpath(os.path.join(WORKSPACE_ROOT, path))
        if not full_path.startswith(WORKSPACE_ROOT):
            return "Error: Path outside workspace."
        try:
            with open(full_path, "r") as f:
                return f.read()
        except Exception as e:
            return f"Error: {str(e)}"

    @staticmethod
    def write_file(path: str, content: str) -> str:
        full_path = os.path.normpath(os.path.join(WORKSPACE_ROOT, path))
        if not full_path.startswith(WORKSPACE_ROOT):
            return "Error: Path outside workspace."
        try:
            os.makedirs(os.path.dirname(full_path), exist_ok=True)
            with open(full_path, "w") as f:
                f.write(content)
            return "File written successfully."
        except Exception as e:
            return f"Error: {str(e)}"

    @staticmethod
    def run_command(command: str) -> str:
        # Restriction: only run commands inside the workspace
        try:
            res = subprocess.run(
                command, shell=True, capture_output=True, text=True, cwd=WORKSPACE_ROOT, timeout=30
            )
            return f"STDOUT: {res.stdout}\nSTDERR: {res.stderr}"
        except Exception as e:
            return f"Error executing command: {str(e)}"

# Definition of tools for LLM
TOOL_SCHEMA = [
    {
        "type": "function",
        "function": {
            "name": "list_files",
            "description": "Lists files in the workspace or a subdirectory.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "The path to list."}
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "Reads the content of a file.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "The path to the file."}
                },
                "required": ["path"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "write_file",
            "description": "Writes content to a file (creates or overwrites).",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "The path to the file."},
                    "content": {"type": "string", "description": "The code or text to write."}
                },
                "required": ["path", "content"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "run_command",
            "description": "Executes a shell command in the workspace.",
            "parameters": {
                "type": "object",
                "properties": {
                    "command": {"type": "string", "description": "The shell command to run (e.g., 'python tests.py')."}
                },
                "required": ["command"]
            }
        }
    }
]

class AgentRuntime:
    def __init__(self, router: BrainRouter):
        self.router = router
        self.history = [
            {"role": "system", "content": f"You are a local autonomous coding agent in the AEGIS Command Center. You have access to the workspace: {WORKSPACE_ROOT}. Always reason through thoughts before acting. Use tools to verify your changes. Your job is to improve the codebase based on the user's instructions."}
        ]

    async def step(self, user_input: str, on_thought: Callable = None, on_tool: Callable = None):
        self.history.append({"role": "user", "content": user_input})
        
        # Max iteration to prevent infinite loops in agent reasoning
        for _ in range(5):
            response = await self.router.get_response(self.history, TOOL_SCHEMA)
            
            if "error" in response:
                yield {"type": "error", "message": response["error"]}
                break

            choice = response["choices"][0]["message"]
            self.history.append(choice)

            if choice.get("content"):
                yield {"type": "thought", "message": choice["content"]}
                if on_thought: await on_thought(choice["content"])

            if "tool_calls" in choice:
                for tool_call in choice["tool_calls"]:
                    func_name = tool_call["function"]["name"]
                    args = json.loads(tool_call["function"]["arguments"])
                    
                    yield {"type": "tool_start", "tool": func_name, "args": args}
                    if on_tool: await on_tool(func_name, args)

                    # Execute the tool
                    result = "Unknown tool call."
                    if func_name == "list_files":
                        result = AgentTools.list_files(args.get("path", "."))
                    elif func_name == "read_file":
                        result = AgentTools.read_file(args.get("path"))
                    elif func_name == "write_file":
                        result = AgentTools.write_file(args.get("path"), args.get("content"))
                    elif func_name == "run_command":
                        result = AgentTools.run_command(args.get("command"))
                    
                    yield {"type": "tool_result", "result": result}
                    
                    self.history.append({
                        "role": "tool",
                        "tool_call_id": tool_call.get("id", "legacy"),
                        "name": func_name,
                        "content": result
                    })
            else:
                # No more tools, we're done
                yield {"type": "complete", "message": choice.get("content", "Task finished.")}
                break
