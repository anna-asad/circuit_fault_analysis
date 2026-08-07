/** Auto-derived from dataset/dataset.csv (normal + fault rows). */
export const DATASET_CIRCUITS = {
  "series_parallel_R1R2R3R4": {
    "design_values": {
      "R1": 1000,
      "R2": 2000,
      "R3": 3000,
      "R4": 1500
    },
    "component_values_normal": {
      "R1": 997.784974,
      "R2": 1961.366057,
      "R3": 2975.678259,
      "R4": 1473.580831
    },
    "node_voltages": {
      "a": 7.268983,
      "b": 4.033308,
      "in": 10.0
    },
    "branch_currents": {
      "R1": 0.002737079,
      "R2": 0.001649705,
      "R3": 0.001087374,
      "R4": 0.002737079
    },
    "sources": {
      "Vin": 10
    },
    "fault_partial_open": {
      "faulted_component": "R1",
      "component_values": {
        "R1": 33030.70438,
        "R2": 2019.192422,
        "R3": 2952.221595,
        "R4": 1504.622335
      }
    },
    "fault_partial_short": {
      "faulted_component": "R4",
      "component_values": {
        "R1": 1011.453434,
        "R2": 1997.252967,
        "R3": 3003.942029,
        "R4": 128.467342
      }
    }
  },
  "multisource_5R_network": {
    "design_values": {
      "R1": 2000,
      "R2": 2000,
      "R3": 1000,
      "R4": 1500,
      "R5": 4000
    },
    "component_values_normal": {
      "R1": 1998.505502,
      "R2": 1974.930561,
      "R3": 996.666275,
      "R4": 1479.977902,
      "R5": 3976.194214,
      "I1": 5
    },
    "node_voltages": {
      "A": 10.0,
      "B": 15.0,
      "C": 2600.413
    },
    "branch_currents": {
      "R1": 0.005003739,
      "R2": -0.00253173,
      "R3": -2.59908,
      "R4": -1.74693,
      "R5": 0.6539955
    },
    "sources": {
      "V1": 10,
      "V2": 15,
      "I1": 5
    },
    "fault_partial_open": {
      "faulted_component": "R2",
      "component_values": {
        "R1": 1996.031178,
        "R2": 90798.459677,
        "R3": 995.396576,
        "R4": 1525.028894,
        "R5": 4011.757027,
        "I1": 5
      }
    },
    "fault_partial_short": {
      "faulted_component": "R1",
      "component_values": {
        "R1": 173.617319,
        "R2": 1998.142963,
        "R3": 992.384766,
        "R4": 1524.803766,
        "R5": 4035.527625,
        "I1": 5
      }
    }
  },
  "current_source_single_R": {
    "design_values": {
      "Rx": 416.67
    },
    "component_values_normal": {
      "Rx": 412.233393,
      "I1": 0.012
    },
    "node_voltages": {
      "p": 4.946801
    },
    "branch_currents": {
      "Rx": 0.012
    },
    "sources": {
      "I1": 0.012
    },
    "fault_partial_open": {
      "faulted_component": "Rx",
      "component_values": {
        "Rx": 14707.709835,
        "I1": 0.012
      }
    },
    "fault_partial_short": {
      "faulted_component": "Rx",
      "component_values": {
        "Rx": 28.648961,
        "I1": 0.012
      }
    }
  },
  "voltage_divider_12k_9k": {
    "design_values": {
      "R1": 12000,
      "R2": 9000
    },
    "component_values_normal": {
      "R1": 11922.229789,
      "R2": 8903.280671
    },
    "node_voltages": {
      "o": 2.992626,
      "s": 7.0
    },
    "branch_currents": {
      "R1": 0.0003361262,
      "R2": 0.0003361262
    },
    "sources": {
      "Vs": 7
    },
    "fault_partial_open": {
      "faulted_component": "R1",
      "component_values": {
        "R1": 308059.272898,
        "R2": 8828.900838
      }
    },
    "fault_partial_short": {
      "faulted_component": "R2",
      "component_values": {
        "R1": 11932.34916,
        "R2": 406.933168
      }
    }
  },
  "kvl_series_loop_ABCDEF": {
    "design_values": {
      "R_FA": 8000,
      "R_AB": 6000,
      "R_BC": 12000,
      "R_DE": 4000
    },
    "component_values_normal": {
      "R_FA": 7913.482119,
      "R_AB": 5984.128377,
      "R_BC": 11780.299731,
      "R_DE": 4047.818236
    },
    "node_voltages": {
      "A": 7.986498,
      "B": 14.02584,
      "C": 25.91483,
      "D": 1.914834,
      "E": 6.0
    },
    "branch_currents": {
      "R_FA": -0.00100923,
      "R_AB": -0.00100923,
      "R_BC": -0.00100923,
      "R_DE": -0.00100923
    },
    "sources": {
      "V_CD": 24,
      "V_EF": 6
    },
    "fault_partial_open": {
      "faulted_component": "R_AB",
      "component_values": {
        "R_FA": 8124.393201,
        "R_AB": 191835.632016,
        "R_BC": 12204.155752,
        "R_DE": 4066.759548
      }
    },
    "fault_partial_short": {
      "faulted_component": "R_AB",
      "component_values": {
        "R_FA": 8149.797247,
        "R_AB": 707.595787,
        "R_BC": 12050.272001,
        "R_DE": 3956.777145
      }
    }
  },
  "vdr_parallel_network": {
    "design_values": {
      "R1": 6000,
      "R2": 12000,
      "R3": 12000
    },
    "component_values_normal": {
      "R1": 6001.89573,
      "R2": 11929.836237,
      "R3": 11981.504799,
      "I1": 0.012
    },
    "node_voltages": {
      "T": 35.93896
    },
    "branch_currents": {
      "R1": 0.005987935,
      "R2": 0.003012528,
      "R3": 0.002999537
    },
    "sources": {
      "I1": 0.012
    },
    "fault_partial_open": {
      "faulted_component": "R3",
      "component_values": {
        "R1": 6037.75639,
        "R2": 11952.689111,
        "R3": 255580.409798,
        "I1": 0.012
      }
    },
    "fault_partial_short": {
      "faulted_component": "R2",
      "component_values": {
        "R1": 6008.614338,
        "R2": 376.268717,
        "R3": 12199.843049,
        "I1": 0.012
      }
    }
  },
  "current_source_voltage_divider": {
    "design_values": {
      "R1": 1000,
      "R2": 2000
    },
    "component_values_normal": {
      "R1": 1008.983163,
      "R2": 2037.837911,
      "I1": 0.01
    },
    "node_voltages": {
      "out": 6.74849
    },
    "branch_currents": {
      "R1": 0.006688407,
      "R2": 0.003311593
    },
    "sources": {
      "I1": 0.01
    },
    "fault_partial_open": {
      "faulted_component": "R2",
      "component_values": {
        "R1": 992.405071,
        "R2": 21721.678602,
        "I1": 0.01
      }
    },
    "fault_partial_short": {
      "faulted_component": "R1",
      "component_values": {
        "R1": 26.553256,
        "R2": 1979.092012,
        "I1": 0.01
      }
    }
  },
  "current_source_t_network": {
    "design_values": {
      "R_s": 500,
      "R_p": 1000,
      "R_L": 1500,
      "R_leak": 10000000.0
    },
    "component_values_normal": {
      "R_s": 509.29836,
      "R_p": 1001.677654,
      "R_L": 1483.415823,
      "R_leak": 10090447.442266,
      "I1": 0.005
    },
    "node_voltages": {
      "a": 7.554383,
      "b": 5.007891,
      "c": 5.007155
    },
    "branch_currents": {
      "R_s": 0.005,
      "R_p": 0.004999504,
      "R_L": 4.962273e-07,
      "R_leak": 4.962273e-07
    },
    "sources": {
      "I1": 0.005
    },
    "fault_partial_open": {
      "faulted_component": "R_leak",
      "component_values": {
        "R_s": 500.033049,
        "R_p": 1011.258795,
        "R_L": 1492.987888,
        "R_leak": 321229463.716386,
        "I1": 0.005
      }
    },
    "fault_partial_short": {
      "faulted_component": "R_p",
      "component_values": {
        "R_s": 508.26576,
        "R_p": 112.525086,
        "R_L": 1478.45976,
        "R_leak": 10150517.96384,
        "I1": 0.005
      }
    }
  },
  "nilsson_ex2_8_multi_source": {
    "design_values": {
      "R1": 2,
      "R2": 3,
      "R3": 4,
      "R4": 5,
      "R5": 7
    },
    "component_values_normal": {
      "R1": 1.962003,
      "R2": 2.982728,
      "R3": 3.981995,
      "R4": 4.989776,
      "R5": 6.980466,
      "I1": 6
    },
    "node_voltages": {
      "a": 21.93077,
      "b": -2.06923,
      "c": 26.3083,
      "d": 13.72588
    },
    "branch_currents": {
      "R1": -2.23115,
      "R2": 2.750801,
      "R3": -0.519647,
      "R4": 2.750801,
      "R5": 3.768846
    },
    "sources": {
      "V1": 24,
      "I1": 6
    },
    "fault_partial_open": {
      "faulted_component": "R4",
      "component_values": {
        "R1": 1.971969,
        "R2": 3.017092,
        "R3": 4.007395,
        "R4": 237.795599,
        "R5": 6.988512,
        "I1": 6
      }
    },
    "fault_partial_short": {
      "faulted_component": "R4",
      "component_values": {
        "R1": 2.024939,
        "R2": 2.985137,
        "R3": 3.97482,
        "R4": 0.506621,
        "R5": 6.940731,
        "I1": 6
      }
    }
  }
};
