import urllib.request
import urllib.parse
from graphviz import Digraph

dot = Digraph(format='png')

dot.node('A', 'Gmail API')
dot.node('B', 'FastAPI Backend')
dot.node('C', 'Rule Engine\n(Regex Checks)')
dot.node('D', 'Embedding Model\n(FastEmbed)')
dot.node('E', 'Vector DB\n(Similarity Search)')
dot.node('F', 'LLM (Llama-3 via Groq)')
dot.node('G', 'Classification Output\n(Safe / Suspicious / Phishing)')

dot.edges(['AB', 'BC', 'CD', 'DE', 'EF', 'FG'])

dot_str = dot.source
url = "https://quickchart.io/graphviz?format=png&graph=" + urllib.parse.quote(dot_str)

req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
with urllib.request.urlopen(req) as response:
    with open('architecture.png', 'wb') as f:
        f.write(response.read())
print("architecture.png created")
