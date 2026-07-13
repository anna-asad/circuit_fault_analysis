from predictor import predict_one

test_samples = [
    {
        "expected": "multi_fault (partial_short + partial_open)",
        "component_values": "{\"R1\": 1000, \"R2\": 10.0, \"R3\": 3000, \"R4\": 60000}",
        "node_voltages": "{\"a\": 9.836092, \"b\": 9.834459, \"in\": 10.0}",
        "branch_currents": "{\"R1\": 0.0001639076, \"R2\": 0.0001633631, \"R3\": 5.445437e-07, \"R4\": 0.0001639076}",
    },
]

for case in test_samples:
    expected = case.pop("expected", None)
    pred, probs = predict_one(case)
    print(f"expected:  {expected}")
    print(f"predicted: {pred}")
    for label, p in sorted(probs.items(), key=lambda x: -x[1]):
        marker = " <-- fired" if p >= 0.5 else ""
        print(f"   {label:22s} {p:.1%}{marker}")
    print()