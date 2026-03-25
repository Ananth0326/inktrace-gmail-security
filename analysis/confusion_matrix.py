import matplotlib.pyplot as plt
from sklearn.metrics import ConfusionMatrixDisplay
import numpy as np

# sample confusion matrix
cm = np.array([[45, 5],
               [3, 47]])

disp = ConfusionMatrixDisplay(confusion_matrix=cm)
disp.plot()
plt.title("Confusion Matrix - HSPDA")
plt.savefig("confusion_matrix.png")
plt.show()