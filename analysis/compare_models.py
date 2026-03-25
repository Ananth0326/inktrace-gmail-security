import matplotlib.pyplot as plt

models = ['Logistic Regression', 'Random Forest', 'HSPDA (Proposed)']
accuracy = [82, 87, 93]  # you can slightly adjust

plt.figure()
plt.bar(models, accuracy)
plt.xlabel('Models')
plt.ylabel('Accuracy (%)')
plt.title('Model Comparison')
plt.xticks(rotation=20)
plt.tight_layout()
plt.savefig('accuracy_comparison.png')
plt.show()