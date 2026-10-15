FROM python:3.13-slim
WORKDIR /relay
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && useradd --system --no-create-home relay
COPY formdeck_relay.py .
USER relay
ENV PORT=8199 FORMDECK_RELAY_HOST=0.0.0.0
EXPOSE 8199
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import urllib.request,os;urllib.request.urlopen('http://127.0.0.1:'+os.environ.get('PORT','8199')+'/healthz',timeout=4)"
CMD ["python", "-I", "formdeck_relay.py"]
