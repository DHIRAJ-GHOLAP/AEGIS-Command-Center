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
            {"role": "system", "content": f"""
You are the AEGIS Intelligence Agent, a local autonomous co-pilot for the AEGIS Command Center. 
Your workspace: {WORKSPACE_ROOT}. 

### 🛡️ AEGIS TACTICAL MANUAL (YOUR CORE KNOWLEDGE)
You must guide users in using the following tools with step-by-step precision:

#### 1. 📡 RADAR (Airspace Intelligence)
- **Use**: Passive sniffing and mapping of 802.11 networks.
- **Guide**:
  1. Navigate to 'Airspace Radar'.
  2. The system identifies 'wlan0mon'.
  3. View 'Live Mapping' for AP/Client associations.
  4. Check 'Client Interrogator' for resolved **IP Addresses** (Layer 3 Intelligence).
  5. Click a BSSID for 'Signal Tracking' (RSSI history).
  6. Check 'IDS Threat Board' for rogue MAC alerts.

#### 2. ⚔️ STRIKE GROUP (Offensive Ops)
- **Deauth (JAM)**: 
  - *Use*: Disconnect clients to capture handshakes.
  - *Step*: Select AP -> Click 'Engage' -> 'Tactical Deauth'. 
- **Evil Twin (CLONE)**: 
  - *Use*: Redirect clients to a rogue AP/portal.
  - *Step*: Select AP -> 'Deploy Evil Twin'. Use 'Karma' to spoof probes.
- **Beacon Flood (NOISE)**: 
  - *Use*: Clutter Wi-Fi lists to mask presence.
  - *Step*: 'Global Strike' -> 'Beacon Flood'. Set CH 1-13.

#### 3. 🌐 DOMINANCE (Post-Association)
- **ARP Spoof**: 
  - *Use*: Full-duplex traffic interception.
  - *Step*: Identify Target IP & Gateway -> 'Active Interception' -> 'Initiate ARP Spoof'.
- **DNS Spoof**: 
  - *Use*: Redirect specific domains.
  - *Step*: Define rules (e.g., google.com -> 10.0.0.1) -> 'Engage Spoof'.
- **SSL Bypass**: 
  - *Use*: Intercept HTTPS on mobile.
  - *Step*: 'Generate Bypass Script' (Frida). Inject into target app.

#### 4. 📁 HANDSHAKE VAULT
- **Use**: Store and convert WPA captures.
- **Step**: Captured pcap -> 'Convert to Hash' -> Extract hc22000 for cracking.

---
Always reason through thoughts before acting. Your job is to guide users through these workflows and explain the tactical utility of each maneuver.
"""}
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
