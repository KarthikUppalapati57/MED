from PIL import Image

def remove_white(input_path, output_path):
    try:
        img = Image.open(input_path)
        img = img.convert("RGBA")
        datas = img.getdata()
        
        newData = []
        for item in datas:
            # Change all white (also shades of whites) to transparent
            if item[0] > 240 and item[1] > 240 and item[2] > 240:
                newData.append((255, 255, 255, 0))
            else:
                newData.append(item)
                
        img.putdata(newData)
        img.save(output_path, "PNG")
        print(f"Processed {input_path}")
    except Exception as e:
        print(f"Error processing {input_path}: {e}")

base_dir = r"c:\Users\ukart\OneDrive - University of Tennessee\M\INtern\MECURSOR\MEVS\code\public"
remove_white(f"{base_dir}\\app-logo.png", f"{base_dir}\\app-logo.png")
remove_white(f"{base_dir}\\app-logo-dark.png", f"{base_dir}\\app-logo-dark.png")
remove_white(f"{base_dir}\\logo.png", f"{base_dir}\\logo.png")
