import AppKit
import ApplicationServices
import Foundation

struct ClickRecord: Encodable {
    let x: Double
    let y: Double
    let button: Int64
    let clickState: Int64
    let timestamp: Double
}

final class ClickRecorder {
    private var records: [ClickRecord] = []
    private let maxClicks: Int

    init(maxClicks: Int) {
        self.maxClicks = maxClicks
    }

    func append(_ record: ClickRecord) {
        records.append(record)
        if let data = try? JSONEncoder().encode(record),
           let line = String(data: data, encoding: .utf8) {
            print(line)
            fflush(stdout)
        }
        if records.count >= maxClicks {
            CFRunLoopStop(CFRunLoopGetMain())
        }
    }
}

let maxClicks = max(1, Int(CommandLine.arguments.dropFirst().first ?? "10") ?? 10)
let recorder = ClickRecorder(maxClicks: maxClicks)

let mask = (1 << CGEventType.leftMouseDown.rawValue)
guard let tap = CGEvent.tapCreate(
    tap: .cgSessionEventTap,
    place: .headInsertEventTap,
    options: .defaultTap,
    eventsOfInterest: CGEventMask(mask),
    callback: { _, type, event, refcon in
        guard type == .leftMouseDown else { return Unmanaged.passUnretained(event) }
        let loc = event.location
        let record = ClickRecord(
            x: Double(loc.x),
            y: Double(loc.y),
            button: event.getIntegerValueField(.mouseEventButtonNumber),
            clickState: event.getIntegerValueField(.mouseEventClickState),
            timestamp: Date().timeIntervalSince1970
        )
        let recorder = Unmanaged<ClickRecorder>.fromOpaque(refcon!).takeUnretainedValue()
        recorder.append(record)
        return Unmanaged.passUnretained(event)
    },
    userInfo: UnsafeMutableRawPointer(Unmanaged.passUnretained(recorder).toOpaque())
) else {
    fputs("failed to create event tap\n", stderr)
    exit(1)
}

let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
CFRunLoopAddSource(CFRunLoopGetMain(), source, .commonModes)
CGEvent.tapEnable(tap: tap, enable: true)
CFRunLoopRun()
