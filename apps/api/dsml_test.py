import xml.etree.ElementTree as ET
import uuid

def _parse_dsml_tool_calls(buffer: str):
    clean_xml = buffer.replace("<｜｜DSML｜｜tool_calls>", "<tool_calls>") \
                      .replace("</｜｜DSML｜｜tool_calls>", "</tool_calls>") \
                      .replace("<｜｜DSML｜｜invoke", "<invoke") \
                      .replace("</｜｜DSML｜｜invoke>", "</invoke>") \
                      .replace("<｜｜DSML｜｜parameter", "<parameter") \
                      .replace("</｜｜DSML｜｜parameter>", "</parameter>")
    
    # In case there is text before or after the tags, we want to extract just the XML part.
    start_idx = clean_xml.find("<tool_calls>")
    end_idx = clean_xml.rfind("</tool_calls>")
    if start_idx != -1 and end_idx != -1:
        clean_xml = clean_xml[start_idx:end_idx + 13]
    else:
        return []

    try:
        root = ET.fromstring(clean_xml)
        tools = []
        for invoke in root.findall('invoke'):
            tool_name = invoke.get('name')
            params = {}
            for param in invoke.findall('parameter'):
                params[param.get('name')] = param.text
            
            import json
            tools.append({
                "id": f"call_dsml_{uuid.uuid4().hex[:8]}",
                "type": "function",
                "function": {
                    "name": tool_name,
                    "arguments": json.dumps(params)
                }
            })
        return tools
    except ET.ParseError as e:
        print(f"Error parseando herramientas: {e}")
        return []

dsml_str = """
Here is what I think:
<｜｜DSML｜｜tool_calls> <｜｜DSML｜｜invoke name="search_codebase"> <｜｜DSML｜｜parameter name="query" string="true">tailwind.config</｜｜DSML｜｜parameter> </｜｜DSML｜｜invoke> <｜｜DSML｜｜invoke name="search_codebase"> <｜｜DSML｜｜parameter name="query" string="true">globals.css</｜｜DSML｜｜parameter> </｜｜DSML｜｜invoke> </｜｜DSML｜｜tool_calls>
And after tools.
"""

print(_parse_dsml_tool_calls(dsml_str))
