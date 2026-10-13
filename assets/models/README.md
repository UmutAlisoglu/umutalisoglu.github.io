# Local background removal model

U²-Net small (U2NETP), by Xuebin Qin and contributors, Apache-2.0.
Source and original architecture: https://github.com/xuebinqin/U-2-Net
ONNX weights distributed by rembg: https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx
Model preprocessing reference: https://github.com/danielgatis/rembg/blob/main/rembg/sessions/u2netp.py

This unmodified model is 4,574,861 bytes. SHA-256:
`309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8`

FileForge loads it from this website only after the visitor starts background removal. It predicts a 320 × 320 foreground mask, which is resized and applied to the source image's alpha channel. This compact model is best for a single distinct subject. Fine hair, translucent objects and busy backgrounds may need a different image or further editing. No user image is used for training or sent to the model publisher. See LICENSE.txt in this folder.
