FROM python:3.11-slim

WORKDIR /app

# Install system dependencies required by Docling / OpenCV / PyTorch
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Expose port (Cloud Run sets PORT environment variable)
ENV PORT=8080
EXPOSE $PORT

# Start FastAPI server
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT}
