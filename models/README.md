# Model card · Qolda E02 model A

**English** · [Русский](#русский)

| | |
|---|---|
| File | [`e02-a/A-tcn.safetensors`](e02-a/A-tcn.safetensors), 11 068 bytes |
| SHA-256 | `e66c0d137d64612658908703051d3319b5bc550a1828d629e1aaf0aad5b90478` |
| Version | `seriq-e02-forearm-1.0.0` |
| Task | Binary: was one elbow-extension cycle (exercise E02) performed `complete` or `incomplete`? |
| Input | 2D trajectory of the right elbow and wrist from RTMPose-m Body7, 64 phase samples, plus a visibility mask |
| Architecture | Temporal CNN trained from scratch, 2 321 parameters |
| Decision threshold | 0.50, chosen on validation |
| Runtime | PyTorch on CUDA, pose detector on ONNX Runtime CUDA |
| Trained on | NVIDIA GeForce RTX 3060 Laptop GPU, torch 2.11.0+cu130, ONNX Runtime 1.27.0 |

## Intended use

It checks one recorded attempt of a home rehabilitation exercise against the instruction and adds it to a personal day count. **It is not a medical device.** It does not measure the elbow angle, pain, severity or recovery, and it must not be used to make treatment decisions.

## Data

[An upper limb stroke rehabilitation exercise video dataset](https://doi.org/10.17632/49h9dcwx5v.1), B. Nair, S. Nandana, M. Thenmozhi Dharshini, V. Viswanathan, Mendeley Data V1, licence CC BY 4.0. One exercise cycle per file, labelled `complete` / `incomplete` by the authors.

| Split | Volunteers | Clips (incomplete / complete) | How used |
|---|---|---|---|
| train | ID 01–04 | 77 (47 / 30) | fitting |
| validation | ID 05, a person the model never saw | 20 (10 / 10) | checkpoint and threshold selection, reported metrics |
| quarantine | – | 10 | conflicting folder and file-name labels; not used |
| sealed test | ID 08 | 20 | not opened for this run |

The split is by person, never by clip. The training manifest is pinned by SHA-256 (`8c73b2a3…6134931`) and lists clip hashes and labels only; videos, frames and pose arrays never leave the training machine.

## Pipeline

1. **Pose.** RTMPose-m Body7 (OpenMMLab, Apache-2.0), converted to a static batch-1 ONNX graph; all 182 nodes run on `CUDAExecutionProvider`.
2. **Forearm track.** Only the detector's right elbow and right wrist (x, y) are used, with a per-slot validity bit. The first usable elbow anchors the track and the median forearm length sets one scale for the whole clip, so motion is kept. No interpolation, no mirrored left arm, no synthetic samples.
3. **Quality gates.** At least 40 of 64 slots with both joints visible and at least 6 in each quarter; projected forearm length within `[0.60, 1.45]` of the median; no implausible jumps; a second, separated arm makes the clip ambiguous. A clip that fails gets a reason (`no_visible_forearm_pair`, `incomplete_forearm_coverage`, `ambiguous_forearm_tracks`, …) and the user sees *“could not assess”*, never *“incomplete”*.
4. **Classifier.** `Conv1d(5→16, k5) → GELU → Conv1d(16→16, k5, dilation 2) → GELU`, then masked mean (16) + masked max (16) + per-coordinate range (4) → `Linear(36→16) → GELU → Dropout(0.15) → Linear(16→1)`.
5. **Confidence.** A normalised margin from the threshold; below 0.10 the answer becomes `uncertain`. It is not a calibrated probability.

## Training

| | |
|---|---|
| Optimiser | AdamW, lr 0.002, weight decay 0.01 |
| Loss | binary cross-entropy with class weights `[0.845, 1.224]` |
| Schedule | 36 epochs, batch 8, 324 steps, seed 601 |
| Selection | best validation balanced accuracy, then macro-F1, then loss, then earlier epoch |
| Peak GPU memory | 20 MB |

Full receipt: [`e02-a/train-receipt.json`](e02-a/train-receipt.json) · metrics: [`e02-a/train-report.json`](e02-a/train-report.json) · runtime binding: [`e02-a/bundle.json`](e02-a/bundle.json).

## Results

| Split | Scored | Abstained | Confusion `[[TN, FP], [FN, TP]]` | Balanced accuracy | Macro-F1 |
|---|---|---|---|---|---|
| train (ID 01–04) | 71 / 77 | 6 (low forearm coverage) | `[[42, 0], [0, 29]]` | 1.00 | 1.00 |
| validation (ID 05) | 20 / 20 | 0 | `[[10, 0], [0, 10]]` | 1.00 | 1.00 |

An earlier run of the same recipe on another machine ([report](../reports/ml/forearm-v1/README.md)) scored 20 / 20 on both validation and the sealed test participant. A control model that saw only the visibility mask reached a balanced accuracy of 0.55, so the classifier relies on the trajectory and not on which frames are missing.

## Limitations

- Every held-out split is one person. These numbers show that the pipeline works, not clinical accuracy.
- Side view, one person in frame, right arm only. Other angles and mirrored setups are not validated.
- Recorded in the dataset authors' setting; real homes have other lighting, clothing and cameras.

## Reproduce

See [docs/TRAINING.md](../docs/TRAINING.md) or the *Train the model* section of the [main README](../README.md#train-the-model). A retrained file on another machine will have a different SHA-256 (the receipt records the source commit, time and hardware); compare the metrics in its receipt, not the hash. To serve your own file, rebuild `bundle.json` with `tools.build_bundle`.

---

## Русский

**Модель A для упражнения E02 (разгибание локтя).** Бинарная классификация одного цикла: `complete` / `incomplete`. На входе 2D-траектория правого локтя и запястья от RTMPose-m Body7, 64 фазы и маска видимости. Временная свёрточная сеть обучена с нуля, 2 321 параметр, порог 0,50 выбран по validation.

- **Данные:** Mendeley Data V1 (Nair et al., CC BY 4.0). Train: добровольцы 01–04, 77 клипов; validation: доброволец 05, которого модель не видела, 20 клипов; 10 клипов с противоречивой разметкой в карантине; закрытый test (ID 08) в этом прогоне не открывался.
- **Обучение:** AdamW (lr 0,002, weight decay 0,01), BCE с весами классов, 36 эпох, batch 8, seed 601, RTX 3060 Laptop.
- **Результат:** validation 20/20, balanced accuracy 1,00; на train 71/77 оценено, 6 клипов честно отклонены из-за плохой видимости предплечья. Контроль только по маске видимости даёт 0,55, то есть модель смотрит на движение, а не на пропуски.
- **Ограничения:** каждая отложенная выборка — один человек; это доказательство работоспособности, а не клиническая точность. Модель не измеряет угол и не ставит диагноз.
