import joblib

lookup = joblib.load('models/nominal_lookup.joblib')

print("=" * 60)
print("CIRCUITS IN TRAINING DATASET (Nominal Lookup)")
print("=" * 60)

for i, (components, values) in enumerate(list(lookup.items())[:8], 1):
    comp_list = sorted(components)
    print(f"\n{i}. Circuit with {len(comp_list)} components: {comp_list}")
    print(f"   Nominal values:")
    for comp in comp_list:
        print(f"     {comp}: {values[comp]:.1f}Ω")
