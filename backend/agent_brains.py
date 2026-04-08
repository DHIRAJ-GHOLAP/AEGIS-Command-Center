import aiohttp
import json
import os
from typing import List, Dict, Any, Optional

class BaseBrain:
    async def chat(self, messages: List[Dict[str, str]], tools: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
        pass

class GeminiBrain(BaseBrain):
    def __init__(self, api_key: Optional[str]):
        self.api_key = api_key
        # Native Google Generative AI URI
        self.url_base = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"

    def _convert_messages(self, messages: List[Dict[str, str]]) -> List[Dict[str, Any]]:
        """Converts OpenAI-style messages to Native Gemini format."""
        gemini_messages = []
        for msg in messages:
            role = msg["role"]
            content = msg.get("content", "")
            
            # Gemini uses 'user' and 'model' as roles
            gemini_role = "user" if role in ["user", "system"] else "model"
            
            # System instructions are often handled separately, 
            # but for this logic we'll prepend them to the first user message
            if role == "system" and gemini_messages:
                # If we already have a message, we might need a different prepend logic,
                # but usually system is at the start.
                pass
                
            gemini_messages.append({
                "role": gemini_role,
                "parts": [{"text": content}]
            })
        return gemini_messages

    def _convert_tools(self, tools: Optional[List[Dict[str, Any]]]) -> Optional[List[Dict[str, Any]]]:
        """Converts OpenAI-style tool schemas to Native Gemini format."""
        if not tools:
            return None
            
        function_declarations = []
        for t in tools:
            if t["type"] == "function":
                func = t["function"]
                # Gemini expects function declarations directly
                decl = {
                    "name": func["name"],
                    "description": func["description"],
                    "parameters": func["parameters"]
                }
                function_declarations.append(decl)
        
        return [{"function_declarations": function_declarations}]

    async def chat(self, messages: List[Dict[str, str]], tools: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
        if not self.api_key:
            return {"error": "CRITICAL: Gemini API Key missing."}
            
        # Native Gemini Payload
        contents = self._convert_messages(messages)
        tools_config = self._convert_tools(tools)
        
        payload = {
            "contents": contents,
            "generationConfig": {
                "temperature": 0.3,
                "topP": 0.8,
                "maxOutputTokens": 2048,
            }
        }
        
        if tools_config:
            payload["tools"] = tools_config

        url = f"{self.url_base}?key={self.api_key}"
        headers = {"Content-Type": "application/json"}
        
        async with aiohttp.ClientSession() as session:
            try:
                async with session.post(url, json=payload, headers=headers) as response:
                    raw_res = await response.json()
                    
                    if response.status != 200:
                        return {"error": f"Gemini Native Error ({response.status}): {json.dumps(raw_res)}"}
                    
                    # Log for debugging if needed
                    # print(f"DEBUG NATIVE: {json.dumps(raw_res)}")
                    
                    # Translate Native Gemini Response back to OpenAI style for the AgentRuntime
                    try:
                        candidate = raw_res["candidates"][0]
                        parts = candidate["content"]["parts"]
                        
                        response_msg = {"role": "assistant", "content": ""}
                        tool_calls = []
                        
                        for part in parts:
                            if "text" in part:
                                response_msg["content"] += part["text"]
                            if "functionCall" in part:
                                call = part["functionCall"]
                                tool_calls.append({
                                    "id": f"call_{os.urandom(4).hex()}",
                                    "type": "function",
                                    "function": {
                                        "name": call["name"],
                                        "arguments": json.dumps(call["args"])
                                    }
                                })
                        
                        # Pack into the expected format
                        result = {
                            "choices": [
                                {
                                    "message": response_msg
                                }
                            ]
                        }
                        if tool_calls:
                            result["choices"][0]["message"]["tool_calls"] = tool_calls
                            
                        return result
                    except Exception as e:
                        return {"error": f"Failed to parse native response: {str(e)}", "raw": raw_res}
                        
            except Exception as e:
                return {"error": f"Strategic Uplink Failure: {str(e)}"}

class BrainRouter:
    def __init__(self, api_key: Optional[str] = None):
        self.primary = GeminiBrain(api_key)

    async def get_response(self, messages: List[Dict[str, str]], tools: Optional[List[Dict[str, Any]]] = None):
        """Routes the query to the primary Gemini brain."""
        return await self.primary.chat(messages, tools)
