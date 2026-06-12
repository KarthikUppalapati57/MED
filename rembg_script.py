import sys
from rembg import remove
from PIL import Image

def process(input_path, output_path):
    try:
        input_image = Image.open(input_path)
        output_image = remove(input_image)
        output_image.save(output_path)
        print(f"Processed {input_path}")
    except Exception as e:
        print(f"Failed {input_path}: {e}")

if __name__ == "__main__":
    process(sys.argv[1], sys.argv[2])
