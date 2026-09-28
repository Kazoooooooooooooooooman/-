"""Build a standalone index.html from AgentDataProtocol.jsx (React/Lucide/Tailwind via CDN, JSX via Babel)."""
import re
import sys
from pathlib import Path

here = Path(__file__).parent
src = (here / "AgentDataProtocol.jsx").read_text()

icons = re.search(r'import \{([^}]*)\} from "lucide-react";', src).group(1)
icons = ", ".join(i.strip() for i in icons.split(",") if i.strip())
body = re.sub(r'^import .*?;\n', "", src, flags=re.S | re.M)
body = body.replace("export default function", "function")

HEAD = """<title>AgentData Protocol</title>
<meta name="description" content="Machine-to-machine data auction simulator: AI agents bid on fresh feature vectors every 5 minutes.">
<style>html,body{background:#07070B;margin:0;min-height:100%}#root{min-height:100vh}</style>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js"></script>
<script>window.react = window.React;</script>
<script src="https://cdn.jsdelivr.net/npm/lucide-react@0.469.0/dist/umd/lucide-react.min.js"></script>
<script src="https://cdn.tailwindcss.com/3.4.16"></script>
<script src="https://cdn.jsdelivr.net/npm/@babel/standalone@7.26.2/babel.min.js"></script>
"""

APP = f"""<div id="root"></div>
<script type="text/babel" data-presets="react">
const {{ useEffect, useReducer, useRef, useState }} = React;
const {{ {icons} }} = LucideReact;
{body}
ReactDOM.createRoot(document.getElementById("root")).render(<AgentDataProtocol />);
</script>
"""

# Full document for the repo; fragment (no doctype/html/body) for Artifact publishing.
(here / "index.html").write_text(
    '<!doctype html>\n<html lang="ja">\n<head>\n<meta charset="utf-8">\n'
    '<meta name="viewport" content="width=device-width,initial-scale=1">\n'
    + HEAD + "</head>\n<body>\n" + APP + "</body>\n</html>\n"
)
if len(sys.argv) > 1:
    Path(sys.argv[1]).write_text(HEAD + APP)
