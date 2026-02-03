import { kickReferenceImageWorker } from "@/server/jobs/referenceImageWorker"
import { kickVideoGenerateWorker } from "@/server/jobs/videoGenerateWorker"
import { kickCozeStoryboardWorker } from "@/server/jobs/cozeStoryboardWorker"
import { kickTvcShotlistWorker } from "@/server/jobs/tvcShotlistWorker"

export function kickAllWorkers(): void {
  kickReferenceImageWorker()
  kickVideoGenerateWorker()
  kickCozeStoryboardWorker()
  kickTvcShotlistWorker()
}
