import aiohttp
import json
import os
from typing import List, Dict, Any, Optional

class BaseBrain:
    async def chat(self, messages: List[Dict[str, str]], tools: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
        pass

class LMStudioBrain(BaseBrain):
    def __init__(self, host: str = "http://localhost:1234"):
        self.url = f"{host}/v1/chat/completions"

    async def chat(self, messages: List[Dict[str, str]], tools: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
        payload = {
            "messages": messages,
            "temperature": 0.3,
            "stream": False
        }
        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = "auto"

        async with aiohttp.ClientSession() as session:
            try:
                async with session.post(self.url, json=payload, timeout=60) as response:
                    if response.status != 200:
                        error_text = await response.text()
                        return {"error": f"LM Studio responded with {response.status}: {error_text}"}
                    return await response.json()
            except Exception as e:
                return {"error": f"Failed to connect to LM Studio: {str(e)}"}

class GeminiBrain(BaseBrain):
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.url = f"https://generativelanguage.googleapis.com/v1beta/openai/chat/completions" # OpenAI compatibility

    async def chat(self, messages: List[Dict[str, str]], tools: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
        if not self.api_key:
            return {"error": "Gemini API Key missing."}
            
        payload = {
            "model": "gpt-4o", # Map to gemini-1.5-pro via OpenAI compatibility mode
            "messages": messages,
            "tools": tools,
            "stream": False
        }
        headers = {"Authorization": f"Bearer {self.api_key}"}
        
        async with aiohttp.ClientSession() as session:
            try:
                async with session.post(self.url, json=payload, headers=headers) as response:
                    return await response.json()
            except Exception as e:
                return {"error": f"Cloud Link Failure: {str(e)}"}

class BrainRouter:
    def __init__(self):
        self.primary = LMStudioBrain()
        self.fallbacks = {}

    def configure_fallback(self, provider: str, api_key: str):
        if provider == "gemini":
            self.fallbacks["gemini"] = GeminiBrain(api_key)

    async def get_response(self, messages: List[Dict[str, str]], tools: Optional[List[Dict[str, Any]]] = None, preferred: str = "local"):
        if preferred == "local":
            res = await self.primary.chat(messages, tools)
            if "error" not in res:
                return res
            # Fallback logic could go here if implemented
            return res
        elif preferred in self.fallbacks:
            return await self.fallbacks[preferred].chat(messages, tools)
        return {"error": "Requested provider not configured."}
